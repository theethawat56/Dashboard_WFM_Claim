import { getDb } from "../db";
import { bangkokDate } from "../bangkokDate";
import { SQL_NOT_VOIDED } from "../taskStatus";
import { sqlInWarranty } from "../warrantyBuffer";
import { ensureClaimCompTables } from "./claimCompensations";
import { syncFactorySentMarks } from "./factorySent";

const GOAL_START = "2026-11-26";
const GOAL_END = "2027-01-26";
const GOAL = 360;
const STRETCH = 460;

export interface WeeklyKpiPoint {
  label: string;
  current: number | null;
  previous: number | null;
  target: string;
  ok: boolean | null;
}

export interface WeeklyKpiData {
  weekStart: string;
  weekEnd: string;
  cards: WeeklyKpiPoint[];
  cumulative: { date: string; actual: number; goal: number; stretch: number }[];
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
  const span = Math.max(1, daysBetween(GOAL_START, GOAL_END));
  const byDay = new Map<string, number>();
  for (const raw of cumulativeRows.rows) {
    const row = raw as Record<string, unknown>;
    byDay.set(String(row.day ?? ""), Number(row.n ?? 0));
  }
  let actual = 0;
  const cumulative: WeeklyKpiData["cumulative"] = [];
  for (let cursor = GOAL_START; cursor <= today; cursor = addDays(cursor, 1)) {
    actual += byDay.get(cursor) ?? 0;
    const passed = daysBetween(GOAL_START, cursor);
    cumulative.push({
      date: cursor.slice(5),
      actual,
      goal: Math.round((GOAL * passed) / span),
      stretch: Math.round((STRETCH * passed) / span),
    });
  }

  return {
    weekStart: start,
    weekEnd: end,
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
