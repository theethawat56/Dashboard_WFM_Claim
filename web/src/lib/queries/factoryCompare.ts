import { getDb } from "../db";
import { bangkokDate } from "../bangkokDate";
import { resolveFactorySkus, skuInSql } from "../factoryClaimSkus";
import { SQL_NOT_VOIDED } from "../taskStatus";
import { ensureClaimCompTables } from "./claimCompensations";
import { listFactoryCatalog, matchFactoryId } from "./factoryPortalDecisions";
import type { FactoryCompareData, FactoryCompareRow } from "@/types/dashboard";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function defaultRange(): { from: string; to: string } {
  const today = bangkokDate();
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

function normalizeRange(fromRaw?: string | null, toRaw?: string | null): { from: string; to: string } {
  const fallback = defaultRange();
  let from = fromRaw && ISO_DATE.test(fromRaw) ? fromRaw : fallback.from;
  let to = toRaw && ISO_DATE.test(toRaw) ? toRaw : fallback.to;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

export async function getFactoryCompare(fromRaw?: string | null, toRaw?: string | null): Promise<FactoryCompareData> {
  await ensureClaimCompTables();
  const db = getDb();
  const range = normalizeRange(fromRaw, toRaw);
  const skuFilter = skuInSql("td.sku", resolveFactorySkus(null));
  const created = `date(datetime(t.timestamp / 1000, 'unixepoch', '+7 hours'))`;

  const result = await db.execute({
    sql: `
      SELECT
        m.supplier_name,
        t.task_type,
        CASE WHEN bt.task_id IS NULL THEN 0 ELSE 1 END AS returned
      FROM tasks t
      JOIN task_details td ON td.task_id = t.id
      LEFT JOIN po_case_matches m ON m.task_id = t.id
      LEFT JOIN (
        SELECT task_id FROM claim_comp_batch_tasks GROUP BY task_id
      ) bt ON bt.task_id = t.id
      WHERE ${SQL_NOT_VOIDED}
        AND ${skuFilter.sql}
        AND ${created} >= ?
        AND ${created} <= ?
    `,
    args: [...skuFilter.args, range.from, range.to],
  });

  const buckets = new Map<string, FactoryCompareRow>();
  const ensure = (id: string, name: string, shortName: string): FactoryCompareRow => {
    const existing = buckets.get(id);
    if (existing) return existing;
    const row: FactoryCompareRow = {
      id,
      name,
      shortName,
      pending_clm: 0,
      pending_mnt: 0,
      returned_clm: 0,
      returned_mnt: 0,
    };
    buckets.set(id, row);
    return row;
  };

  for (const factory of listFactoryCatalog()) ensure(factory.id, factory.name, factory.shortName);
  ensure("unmatched", "ยังจับโรงงานไม่ได้", "ยังไม่จับได้");

  for (const raw of result.rows) {
    const record = raw as Record<string, unknown>;
    const factoryId = matchFactoryId(record.supplier_name != null ? String(record.supplier_name) : null) ?? "unmatched";
    const row = buckets.get(factoryId) ?? ensure(factoryId, factoryId, factoryId);
    const repair = String(record.task_type ?? "") === "repair";
    const returned = Number(record.returned ?? 0) === 1;
    if (repair && returned) row.returned_mnt += 1;
    else if (repair) row.pending_mnt += 1;
    else if (returned) row.returned_clm += 1;
    else row.pending_clm += 1;
  }

  const rows = [...buckets.values()]
    .filter((row) => row.id !== "unmatched" || row.pending_clm + row.pending_mnt + row.returned_clm + row.returned_mnt > 0)
    .sort((a, b) => {
      const pending = (row: FactoryCompareRow) => row.pending_clm + row.pending_mnt;
      return pending(b) - pending(a) || a.shortName.localeCompare(b.shortName);
    });

  return {
    from: range.from,
    to: range.to,
    pending_clm: rows.reduce((sum, row) => sum + row.pending_clm, 0),
    pending_mnt: rows.reduce((sum, row) => sum + row.pending_mnt, 0),
    returned_clm: rows.reduce((sum, row) => sum + row.returned_clm, 0),
    returned_mnt: rows.reduce((sum, row) => sum + row.returned_mnt, 0),
    rows,
  };
}
