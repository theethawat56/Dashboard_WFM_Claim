import { getDb } from "../db";
import type { MonthlyTrendRow } from "@/types/dashboard";

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
