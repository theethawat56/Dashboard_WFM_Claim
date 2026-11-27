import { getDb } from "../db";
import { bangkokDate } from "../bangkokDate";
import { SQL_NOT_VOIDED } from "../taskStatus";
import { sqlInWarranty } from "../warrantyBuffer";
import { ensureClaimCompTables } from "./claimCompensations";
import { listFactoryCatalog, listPortalFactories, matchFactoryId } from "./factoryPortalDecisions";
import { syncFactorySentMarks } from "./factorySent";
import { confirmedSkuFactories } from "./skuFactoryMap";

const GOAL_START = "2026-11-26";
const GOAL_END = "2027-01-26";
const GOAL = 360;
const STRETCH = 460;
const HOLIDAYS = new Set(["2026-12-07", "2026-12-10", "2026-12-31", "2027-01-01"]);
const DEFAULT_ACCEPT = 0.9;

export interface WeeklyKpiPoint {
  label: string;
  current: number | null;
  previous: number | null;
  target: string;
  ok: boolean | null;
}

export interface PaceTarget {
  done: number;
  target: number;
}

export interface WeeklyPace {
  workingDaysLeft: number;
  isWorkingDay: boolean;
  goal: PaceTarget;
  stretch: PaceTarget;
  waiting: number;
  acceptPercent: number;
  action: "send" | "hurry";
  sendMore: number;
  hurryFactory: string | null;
}

export interface WeeklyKpiData {
  weekStart: string;
  weekEnd: string;
  cards: WeeklyKpiPoint[];
  pace: WeeklyPace;
  cumulative: { date: string; daily: number; actual: number; goal: number; stretch: number }[];
}

function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekStart(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const shift = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + shift);
  return date.toISOString().slice(0, 10);
}

function isWorkingDay(ymd: string): boolean {
  const [year, month, day] = ymd.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !HOLIDAYS.has(ymd);
}

function workingDaysInclusive(from: string, to: string): number {
  if (to < from) return 0;
  let count = 0;
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    if (isWorkingDay(cursor)) count += 1;
  }
  return count;
}

function dailyTarget(goal: number, doneBeforeToday: number, daysLeft: number, todayWorks: boolean): number {
  const need = Math.max(0, goal - doneBeforeToday);
  if (!todayWorks || daysLeft === 0) return 0;
  return Math.ceil(need / daysLeft);
}

function daysBetween(from: string, to: string): number {
  const [ay, am, ad] = from.split("-").map(Number);
  const [by, bm, bd] = to.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function countSent(from: string, to: string): Promise<number> {
  const result = await getDb().execute({
    sql: `
      SELECT COUNT(*) AS n
      FROM factory_submissions fs
      JOIN tasks t ON t.id = fs.task_id
      JOIN task_details td ON td.task_id = t.id
      WHERE ${SQL_NOT_VOIDED}
        AND ${sqlInWarranty()}
        AND instr(fs.sent_at, ':') > 0
        AND date(fs.sent_at) >= ?
        AND date(fs.sent_at) <= ?
    `,
    args: [from, to],
  });
  return Number((result.rows[0] as { n?: number } | undefined)?.n ?? 0);
}

async function replies(from: string, to: string): Promise<{ approved: number; rejected: number; days: number[] }> {
  const result = await getDb().execute({
    sql: `
      SELECT d.decision,
             CASE WHEN instr(COALESCE(fs.sent_at, ''), ':') > 0 THEN date(fs.sent_at) ELSE NULL END AS sent_on,
             date(d.submitted_at) AS replied_on
      FROM factory_portal_decisions d
      JOIN tasks t ON t.id = d.task_id
      JOIN task_details td ON td.task_id = t.id
      LEFT JOIN factory_submissions fs ON fs.task_id = t.id
      WHERE ${SQL_NOT_VOIDED}
        AND ${sqlInWarranty()}
        AND d.decision IN ('approved', 'rejected')
        AND date(d.submitted_at) >= ?
        AND date(d.submitted_at) <= ?
    `,
    args: [from, to],
  });
  let approved = 0;
  let rejected = 0;
  const days: number[] = [];
  for (const raw of result.rows) {
    const row = raw as Record<string, unknown>;
    if (String(row.decision) === "approved") approved += 1;
    else rejected += 1;
    const sent = row.sent_on != null ? String(row.sent_on) : "";
    const replied = row.replied_on != null ? String(row.replied_on) : "";
    if (sent && replied) days.push(Math.max(0, daysBetween(sent, replied)));
  }
  return { approved, rejected, days };
}

export async function getWeeklyKpis(): Promise<WeeklyKpiData> {
  await ensureClaimCompTables();
  await syncFactorySentMarks();
  const today = bangkokDate();
  const start = weekStart(today);
  const end = addDays(start, 6);
  const prevStart = addDays(start, -7);
  const prevEnd = addDays(start, -1);
  const db = getDb();

  const [sent, sentPrev, reply, replyPrev, overdue, money, moneyPrev, cumulativeRows] = await Promise.all([
    countSent(start, end),
    countSent(prevStart, prevEnd),
    replies(start, end),
    replies(prevStart, prevEnd),
    db.execute({
      sql: `
        SELECT COUNT(*) AS n
        FROM factory_submissions fs
        JOIN tasks t ON t.id = fs.task_id
        JOIN task_details td ON td.task_id = t.id
        LEFT JOIN (SELECT task_id FROM claim_comp_batch_tasks GROUP BY task_id) bt ON bt.task_id = t.id
        LEFT JOIN factory_portal_decisions d ON d.task_id = t.id
        WHERE ${SQL_NOT_VOIDED}
          AND ${sqlInWarranty()}
          AND bt.task_id IS NULL
          AND (d.task_id IS NULL OR d.status = 'waiting')
          AND instr(fs.sent_at, ':') > 0
          AND julianday(?) - julianday(date(fs.sent_at)) > 14
      `,
      args: [today],
    }),
    bahtPerClaim(start, end),
    bahtPerClaim(prevStart, prevEnd),
    db.execute({
      sql: `
        SELECT date(b.created_at) AS day, COUNT(DISTINCT bt.task_id) AS n
        FROM claim_comp_batches b
        JOIN claim_comp_batch_tasks bt ON bt.batch_id = b.id
        JOIN tasks t ON t.id = bt.task_id
        JOIN task_details td ON td.task_id = t.id
        WHERE ${SQL_NOT_VOIDED}
          AND ${sqlInWarranty()}
          AND date(b.created_at) >= ?
          AND date(b.created_at) <= ?
        GROUP BY day
      `,
      args: [GOAL_START, today],
    }),
  ]);

  const replyTotal = reply.approved + reply.rejected;
  const replyPrevTotal = replyPrev.approved + replyPrev.rejected;
  const accept = replyTotal === 0 ? null : (reply.approved / replyTotal) * 100;
  const acceptPrev = replyPrevTotal === 0 ? null : (replyPrev.approved / replyPrevTotal) * 100;
  const medianDays = median(reply.days);
  const medianPrev = median(replyPrev.days);
  const late = Number((overdue.rows[0] as { n?: number } | undefined)?.n ?? 0);
  const byDay = new Map<string, number>();
  for (const raw of cumulativeRows.rows) {
    const row = raw as Record<string, unknown>;
    byDay.set(String(row.day ?? ""), Number(row.n ?? 0));
  }
  const totalWorking = Math.max(1, workingDaysInclusive(GOAL_START, GOAL_END));
  let actual = 0;
  let doneBeforeToday = 0;
  const cumulative: WeeklyKpiData["cumulative"] = [];
  const lastChartDay = today < GOAL_START ? GOAL_START : today > GOAL_END ? GOAL_END : today;
  for (let cursor = GOAL_START; cursor <= lastChartDay; cursor = addDays(cursor, 1)) {
    const daily = byDay.get(cursor) ?? 0;
    actual += daily;
    if (cursor < today) doneBeforeToday = actual;
    const elapsed = workingDaysInclusive(GOAL_START, cursor);
    cumulative.push({
      date: cursor.slice(5),
      daily,
      actual,
      goal: Math.round((GOAL * elapsed) / totalWorking),
      stretch: Math.round((STRETCH * elapsed) / totalWorking),
    });
  }
  const todayWorks = isWorkingDay(today) && today >= GOAL_START && today <= GOAL_END;
  const daysLeft = today > GOAL_END ? 0 : workingDaysInclusive(today < GOAL_START ? GOAL_START : today, GOAL_END);
  const waiting = await waitingByFactory();
  const campaign = await replies(GOAL_START, today);
  const campaignTotal = campaign.approved + campaign.rejected;
  const acceptRatio = campaignTotal === 0 ? DEFAULT_ACCEPT : campaign.approved / campaignTotal;
  const goalTarget = dailyTarget(GOAL, doneBeforeToday, daysLeft, todayWorks);
  const compensatedToday = byDay.get(today) ?? 0;
  const gap = Math.max(0, goalTarget - compensatedToday);
  const expected = waiting.total * acceptRatio;
  const sendMore = expected >= gap
    ? 0
    : Math.ceil((gap - expected) / (acceptRatio > 0 ? acceptRatio : 1));

  return {
    weekStart: start,
    weekEnd: end,
    pace: {
      workingDaysLeft: daysLeft,
      isWorkingDay: todayWorks,
      goal: { done: compensatedToday, target: goalTarget },
      stretch: { done: compensatedToday, target: dailyTarget(STRETCH, doneBeforeToday, daysLeft, todayWorks) },
      waiting: waiting.total,
      acceptPercent: Math.round(acceptRatio * 1000) / 10,
      action: expected >= gap ? "hurry" : "send",
      sendMore,
      hurryFactory: waiting.topName,
    },
    cards: [
      { label: "ส่งโรงงาน", current: sent, previous: sentPrev, target: "≥ 20", ok: sent >= 20 },
      { label: "โรงงานตอบ", current: replyTotal, previous: replyPrevTotal, target: "≥ 45", ok: replyTotal >= 45 },
      {
        label: "% ยอมรับ",
        current: accept == null ? null : Math.round(accept * 10) / 10,
        previous: acceptPrev == null ? null : Math.round(acceptPrev * 10) / 10,
        target: "≥ 90%",
        ok: accept == null ? null : accept >= 90,
      },
      {
        label: "วันที่โรงงานตอบ",
        current: medianDays,
        previous: medianPrev,
        target: `≤ 14 วัน · ค้างเกิน 14 วัน ${late}`,
        ok: (medianDays == null || medianDays <= 14) && late === 0,
      },
      {
        label: "บาทต่องาน CLM",
        current: money.perTask,
        previous: moneyPrev.perTask,
        target: "≥ 25% ของต้นทุน",
        ok: money.costShare == null ? null : money.costShare >= 25,
      },
    ],
    cumulative,
  };
}

async function waitingByFactory(): Promise<{ total: number; topName: string | null }> {
  const result = await getDb().execute(`
    SELECT t.id, td.sku, m.supplier_name
    FROM tasks t
    JOIN task_details td ON td.task_id = t.id
    LEFT JOIN po_case_matches m ON m.task_id = t.id
    LEFT JOIN factory_submissions fs ON fs.task_id = t.id
    LEFT JOIN factory_portal_decisions d ON d.task_id = t.id
    LEFT JOIN (SELECT task_id FROM claim_comp_batch_tasks GROUP BY task_id) comp ON comp.task_id = t.id
    WHERE ${SQL_NOT_VOIDED}
      AND ${sqlInWarranty()}
      AND comp.task_id IS NULL
      AND fs.task_id IS NOT NULL
      AND (d.decision IS NULL OR d.decision NOT IN ('approved', 'rejected'))
  `);
  const assigned = await confirmedSkuFactories();
  const names = new Map<string, string>();
  for (const factory of listFactoryCatalog()) names.set(factory.id, factory.shortName);
  for (const factory of await listPortalFactories()) {
    if (!names.has(factory.id)) names.set(factory.id, factory.name);
  }
  names.set("unmatched", "ยังไม่จับได้");
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const raw of result.rows) {
    const row = raw as Record<string, unknown>;
    const id = String(row.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const sku = row.sku != null ? String(row.sku).trim() : "";
    const choice = assigned.get(sku);
    if (choice?.status === "excluded") continue;
    const factoryId = choice?.status === "confirmed" && choice.factoryId
      ? choice.factoryId
      : matchFactoryId(row.supplier_name != null ? String(row.supplier_name) : null) ?? "unmatched";
    counts.set(factoryId, (counts.get(factoryId) ?? 0) + 1);
  }
  let total = 0;
  let topName: string | null = null;
  let top = 0;
  for (const [id, count] of counts) {
    total += count;
    if (count > top) {
      top = count;
      topName = names.get(id) ?? id;
    }
  }
  return { total, topName };
}

async function bahtPerClaim(from: string, to: string): Promise<{ perTask: number | null; costShare: number | null }> {
  const result = await getDb().execute({
    sql: `
      SELECT COALESCE(SUM(COALESCE(bt.amount_per_task, 0)), 0) AS amount,
             COALESCE(SUM(CASE WHEN m.unit_cost IS NOT NULL THEN m.unit_cost ELSE 0 END), 0) AS cost,
             COUNT(*) AS n
      FROM factory_portal_decisions d
      JOIN tasks t ON t.id = d.task_id
      JOIN task_details td ON td.task_id = t.id
      LEFT JOIN claim_comp_batch_tasks bt ON bt.task_id = t.id
      LEFT JOIN po_case_matches m ON m.task_id = t.id AND m.match_tier != 'gray'
      WHERE ${SQL_NOT_VOIDED}
        AND ${sqlInWarranty()}
        AND d.decision = 'approved'
        AND t.task_type = 'claim'
        AND date(d.submitted_at) >= ?
        AND date(d.submitted_at) <= ?
    `,
    args: [from, to],
  });
  const row = result.rows[0] as { amount?: number; cost?: number; n?: number } | undefined;
  const count = Number(row?.n ?? 0);
  const amount = Number(row?.amount ?? 0);
  const cost = Number(row?.cost ?? 0);
  return {
    perTask: count === 0 ? null : Math.round(amount / count),
    costShare: cost <= 0 ? null : Math.round((amount / cost) * 1000) / 10,
  };
}
