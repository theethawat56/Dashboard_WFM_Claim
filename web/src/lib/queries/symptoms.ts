import { getDb } from "../db";
import type { SymptomRow } from "@/types/dashboard";

export async function getSymptoms(limit = 20): Promise<SymptomRow[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `
      SELECT
        td.issue_group,
        COUNT(*) as frequency,
        GROUP_CONCAT(DISTINCT td.sku) as related_skus
      FROM task_details td
      JOIN tasks t ON t.id = td.task_id
      WHERE t.status != 'VOIDED'
        AND td.issue_group IS NOT NULL
        AND TRIM(td.issue_group) != ''
      GROUP BY td.issue_group
      ORDER BY frequency DESC
      LIMIT ?
    `,
    args: [limit],
  });
  return r.rows.map((row: Record<string, unknown>) => ({
    issue_group: String(row.issue_group ?? ""),
    frequency: Number(row.frequency ?? 0),
    related_skus: row.related_skus != null ? String(row.related_skus) : null,
  }));
}
