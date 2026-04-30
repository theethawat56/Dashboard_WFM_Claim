import { getDb } from "../db";
import type { MonthlyTrendRow, DailyTrendRow, DailyTopSkuRow } from "@/types/dashboard";

const EIGHTEEN_MONTHS_MS = 18 * 30 * 24 * 60 * 60 * 1000;

export async function getMonthlyTrend(): Promise<MonthlyTrendRow[]> {
  const db = getDb();
  const cutoff = Date.now() - EIGHTEEN_MONTHS_MS;
  const r = await db.execute({
    sql: `
      SELECT
        strftime('%Y-%m', datetime(t.timestamp / 1000, 'unixepoch')) as month,
        SUM(CASE WHEN t.task_type = 'repair' THEN 1 ELSE 0 END) as repair_count,
        SUM(CASE WHEN t.task_type = 'claim'  THEN 1 ELSE 0 END) as claim_count,
        SUM(CASE WHEN t.is_reclaim = 1       THEN 1 ELSE 0 END) as reclaim_count,
        COUNT(*) as total
      FROM tasks t
      WHERE t.status != 'VOIDED'
        AND t.timestamp >= ?
      GROUP BY month
      ORDER BY month ASC
    `,
    args: [cutoff],
  });
  return r.rows.map((row: Record<string, unknown>) => ({
    month: String(row.month ?? ""),
    repair_count: Number(row.repair_count ?? 0),
    claim_count: Number(row.claim_count ?? 0),
    reclaim_count: Number(row.reclaim_count ?? 0),
    total: Number(row.total ?? 0),
  }));
}

export async function getDailyTrend(days: number = 30): Promise<DailyTrendRow[]> {
  const db = getDb();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const r = await db.execute({
    sql: `
      SELECT
        strftime('%Y-%m-%d', datetime(t.timestamp / 1000, 'unixepoch')) as date,
        SUM(CASE WHEN t.task_type = 'repair' THEN 1 ELSE 0 END) as repair_count,
        SUM(CASE WHEN t.task_type = 'claim'  THEN 1 ELSE 0 END) as claim_count,
        SUM(CASE WHEN t.is_reclaim = 1       THEN 1 ELSE 0 END) as reclaim_count,
        COUNT(*) as total
      FROM tasks t
      WHERE t.status != 'VOIDED'
        AND t.timestamp >= ?
      GROUP BY date
      ORDER BY date ASC
    `,
    args: [cutoff],
  });
  return r.rows.map((row: Record<string, unknown>) => ({
    date: String(row.date ?? ""),
    repair_count: Number(row.repair_count ?? 0),
    claim_count: Number(row.claim_count ?? 0),
    reclaim_count: Number(row.reclaim_count ?? 0),
    total: Number(row.total ?? 0),
  }));
}

function toThaiDateString(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

export async function getDailyTopSkus(date?: string, limit: number = 5): Promise<DailyTopSkuRow[]> {
  const db = getDb();
  const targetDate = date ?? toThaiDateString();
  // Convert YYYY-MM-DD (Thai timezone) to UTC ms range
  const dayStartLocal = new Date(targetDate + "T00:00:00+07:00").getTime();
  const dayEndLocal = new Date(targetDate + "T23:59:59.999+07:00").getTime();

  const r = await db.execute({
    sql: `
      SELECT
        td.sku,
        td.product_model as model,
        SUM(CASE WHEN t.task_type = 'repair' THEN 1 ELSE 0 END) as repair_count,
        SUM(CASE WHEN t.task_type = 'claim'  THEN 1 ELSE 0 END) as claim_count,
        SUM(CASE WHEN t.is_reclaim = 1       THEN 1 ELSE 0 END) as reclaim_count,
        COUNT(*) as total
      FROM tasks t
      JOIN task_details td ON t.id = td.task_id
      WHERE t.status != 'VOIDED'
        AND t.timestamp >= ?
        AND t.timestamp <= ?
        AND td.sku IS NOT NULL
        AND TRIM(td.sku) != ''
      GROUP BY td.sku, td.product_model
      ORDER BY total DESC
      LIMIT ?
    `,
    args: [dayStartLocal, dayEndLocal, limit],
  });

  return r.rows.map((row: Record<string, unknown>, i: number) => ({
    rank: i + 1,
    date: targetDate,
    sku: String(row.sku ?? ""),
    model: String(row.model ?? ""),
    repair_count: Number(row.repair_count ?? 0),
    claim_count: Number(row.claim_count ?? 0),
    reclaim_count: Number(row.reclaim_count ?? 0),
    total: Number(row.total ?? 0),
  }));
}
