import { getDb } from "../db";
import { bangkokDate } from "../bangkokDate";
import { resolveFactorySkus, skuInSql } from "../factoryClaimSkus";
import { SQL_NOT_VOIDED } from "../taskStatus";
import { sqlInWarranty } from "../warrantyBuffer";
import { ensureClaimCompTables } from "./claimCompensations";
import { listFactoryCatalog, listPortalFactories, matchFactoryId } from "./factoryPortalDecisions";
import { confirmedSkuFactories } from "./skuFactoryMap";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ScorePair = { clm: number; mnt: number };
export type ScoreMedian = { clm: number | null; mnt: number | null };

export interface FactoryScoreRow {
  id: string;
  name: string;
  shortName: string;
  ready: ScorePair;
  missing: ScorePair;
  waiting: ScorePair;
  approved: ScorePair;
  rejected: ScorePair;
  medianDays: ScoreMedian;
  bahtPerJob: ScoreMedian;
  returnRate: number | null;
}

export interface FactoryScoreboard {
  from: string;
  to: string;
  factories: { id: string; name: string }[];
  rows: FactoryScoreRow[];
}

function defaultRange(): { from: string; to: string } {
  const today = bangkokDate();
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function daysBetween(from: string, to: string): number {
  const [ay, am, ad] = from.split("-").map(Number);
  const [by, bm, bd] = to.split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000));
}

function blankSerial(value: string): boolean {
  return value.trim().toLowerCase().replace(/[- ./]/g, "").length < 5;
}

type Bucket = FactoryScoreRow & {
  replyClm: number[];
  replyMnt: number[];
  bahtClm: number[];
  bahtMnt: number[];
  jobs: number;
  compensatedJobs: number;
};

export async function getFactoryScoreboard(
  fromRaw?: string | null,
  toRaw?: string | null,
  factoryRaw?: string | null,
  kindRaw?: string | null
): Promise<FactoryScoreboard> {
  await ensureClaimCompTables();
  const fallback = defaultRange();
  let from = fromRaw && ISO_DATE.test(fromRaw) ? fromRaw : fallback.from;
  let to = toRaw && ISO_DATE.test(toRaw) ? toRaw : fallback.to;
  if (from > to) [from, to] = [to, from];
  const factoryFilter = factoryRaw && factoryRaw !== "all" ? factoryRaw : "";
  const kind = kindRaw === "clm" || kindRaw === "mnt" ? kindRaw : "all";
  const db = getDb();
  const skuFilter = skuInSql("td.sku", resolveFactorySkus(null));
  const opened = `date(datetime(t.timestamp / 1000, 'unixepoch', '+7 hours'))`;
  const result = await db.execute({
    sql: `
      SELECT
        t.id,
        t.task_type,
        td.sku,
        m.supplier_name,
        td.product_serial,
        td.issue_group,
        td.issue_description,
        fs.sent_at,
        CASE WHEN fs.task_id IS NULL THEN 0 ELSE 1 END AS on_link,
        d.decision,
        date(d.submitted_at) AS replied_on,
        bt.amount_per_task,
        CASE WHEN comp.task_id IS NULL THEN 0 ELSE 1 END AS compensated
      FROM tasks t
      JOIN task_details td ON td.task_id = t.id
      LEFT JOIN po_case_matches m ON m.task_id = t.id
      LEFT JOIN factory_submissions fs ON fs.task_id = t.id
      LEFT JOIN factory_portal_decisions d ON d.task_id = t.id
      LEFT JOIN claim_comp_batch_tasks bt ON bt.task_id = t.id
      LEFT JOIN (SELECT task_id FROM claim_comp_batch_tasks GROUP BY task_id) comp ON comp.task_id = t.id
      WHERE ${SQL_NOT_VOIDED}
        AND ${sqlInWarranty()}
        AND ${skuFilter.sql}
        AND ${opened} >= ?
        AND ${opened} <= ?
    `,
    args: [...skuFilter.args, from, to],
  });

  const assigned = await confirmedSkuFactories();
  const catalog = listFactoryCatalog();
  const portals = await listPortalFactories();
  const buckets = new Map<string, Bucket>();
  const ensure = (id: string, name: string, shortName: string): Bucket => {
    const existing = buckets.get(id);
    if (existing) return existing;
    const row: Bucket = {
      id,
      name,
      shortName,
      ready: { clm: 0, mnt: 0 },
      missing: { clm: 0, mnt: 0 },
      waiting: { clm: 0, mnt: 0 },
      approved: { clm: 0, mnt: 0 },
      rejected: { clm: 0, mnt: 0 },
      medianDays: { clm: null, mnt: null },
      bahtPerJob: { clm: null, mnt: null },
      returnRate: null,
      replyClm: [],
      replyMnt: [],
      bahtClm: [],
      bahtMnt: [],
      jobs: 0,
      compensatedJobs: 0,
    };
    buckets.set(id, row);
    return row;
  };
  for (const factory of catalog) ensure(factory.id, factory.name, factory.shortName);
  for (const factory of portals) {
    const known = catalog.find((item) => item.id === factory.id);
    ensure(factory.id, factory.name, known?.shortName ?? factory.name);
  }
  ensure("unmatched", "ยังจับโรงงานไม่ได้", "ยังไม่จับได้");

  const seen = new Set<string>();
  for (const raw of result.rows) {
    const record = raw as Record<string, unknown>;
    const id = String(record.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const repair = String(record.task_type ?? "") === "repair";
    const side = repair ? "mnt" : "clm";
    if (kind === "clm" && side !== "clm") continue;
    if (kind === "mnt" && side !== "mnt") continue;
    const sku = record.sku != null ? String(record.sku).trim() : "";
    const choice = assigned.get(sku);
    if (choice?.status === "excluded") continue;
    const factoryId = choice?.status === "confirmed" && choice.factoryId
      ? choice.factoryId
      : matchFactoryId(record.supplier_name != null ? String(record.supplier_name) : null) ?? "unmatched";
    if (factoryFilter && factoryId !== factoryFilter) continue;
    const bucket = buckets.get(factoryId) ?? ensure(factoryId, factoryId, factoryId);
    bucket.jobs += 1;
    const decision = record.decision != null ? String(record.decision) : "";
    const compensated = Number(record.compensated ?? 0) === 1;
    if (compensated) bucket.compensatedJobs += 1;
    const sentAt = record.sent_at != null ? String(record.sent_at) : "";
    const onLink = Number(record.on_link ?? 0) === 1;
    const serial = record.product_serial != null ? String(record.product_serial) : "";
    const symptom = `${record.issue_group ?? ""}`.trim() || `${record.issue_description ?? ""}`.trim();
    if (decision === "approved") bucket.approved[side] += 1;
    else if (decision === "rejected") bucket.rejected[side] += 1;
    else if (onLink && !compensated) bucket.waiting[side] += 1;
    else if (!onLink && !compensated && !blankSerial(serial) && symptom) bucket.ready[side] += 1;
    else if (!onLink && !compensated) bucket.missing[side] += 1;

    const replied = record.replied_on != null ? String(record.replied_on) : "";
    if ((decision === "approved" || decision === "rejected") && sentAt.includes(":") && replied) {
      const days = daysBetween(sentAt.slice(0, 10), replied.slice(0, 10));
      if (side === "clm") bucket.replyClm.push(days);
      else bucket.replyMnt.push(days);
    }
    if (decision === "approved" && record.amount_per_task != null) {
      const amount = Number(record.amount_per_task);
      if (side === "clm") bucket.bahtClm.push(amount);
      else bucket.bahtMnt.push(amount);
    }
  }

  const rows = [...buckets.values()]
    .map((row) => ({
      ...row,
      medianDays: { clm: median(row.replyClm), mnt: median(row.replyMnt) },
      bahtPerJob: {
        clm: row.bahtClm.length ? Math.round(row.bahtClm.reduce((sum, value) => sum + value, 0) / row.bahtClm.length) : null,
        mnt: row.bahtMnt.length ? Math.round(row.bahtMnt.reduce((sum, value) => sum + value, 0) / row.bahtMnt.length) : null,
      },
      returnRate: row.jobs === 0 ? null : Math.round((row.compensatedJobs / row.jobs) * 1000) / 10,
    }))
    .filter((row) => {
      const total = row.ready.clm + row.ready.mnt + row.missing.clm + row.missing.mnt
        + row.waiting.clm + row.waiting.mnt + row.approved.clm + row.approved.mnt
        + row.rejected.clm + row.rejected.mnt;
      if (row.id === "unmatched") return total > 0;
      return total > 0 || catalog.some((factory) => factory.id === row.id);
    })
    .sort((a, b) => (b.waiting.clm + b.waiting.mnt) - (a.waiting.clm + a.waiting.mnt) || a.shortName.localeCompare(b.shortName));

  return {
    from,
    to,
    factories: portals.map((factory) => ({
      id: factory.id,
      name: catalog.find((item) => item.id === factory.id)?.shortName ?? factory.name,
    })),
    rows: rows.map(({ replyClm: _replyClm, replyMnt: _replyMnt, bahtClm: _bahtClm, bahtMnt: _bahtMnt, jobs: _jobs, compensatedJobs: _compensatedJobs, ...row }) => row),
  };
}
