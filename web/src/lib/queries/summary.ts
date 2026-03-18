import { getDb } from "../db";
import type { SummaryStats } from "@/types/dashboard";

export async function getSummary(): Promise<SummaryStats> {
  const db = getDb();
  const r = await db.execute(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN task_type = 'repair' THEN 1 ELSE 0 END) as repair_count,
      SUM(CASE WHEN task_type = 'claim'  THEN 1 ELSE 0 END) as claim_count,
      SUM(CASE WHEN t.is_reclaim = 1     THEN 1 ELSE 0 END) as reclaim_count,
      SUM(CASE WHEN t.is_unfixed = 1     THEN 1 ELSE 0 END) as unfixed_count,
      COUNT(DISTINCT CASE WHEN td.sku IS NOT NULL AND TRIM(td.sku) != '' THEN td.sku END) as unique_sku_count
    FROM tasks t
    LEFT JOIN task_details td ON t.id = td.task_id
    WHERE t.status != 'VOIDED'
  `);
  const row = r.rows[0] as Record<string, number | null>;
  return {
    total: Number(row?.total ?? 0),
    repair_count: Number(row?.repair_count ?? 0),
    claim_count: Number(row?.claim_count ?? 0),
    reclaim_count: Number(row?.reclaim_count ?? 0),
    unfixed_count: Number(row?.unfixed_count ?? 0),
    unique_sku_count: Number(row?.unique_sku_count ?? 0),
  };
}

export async function getLatestSyncFinishedAt(): Promise<string | null> {
  const db = getDb();
  const r = await db.execute(
    `SELECT finished_at FROM sync_log WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1`
  );
  const row = r.rows[0] as { finished_at?: string } | undefined;
  return row?.finished_at ?? null;
}
