import { getDb } from "../db";
import type { EvidenceRow } from "@/types/dashboard";

export async function getEvidenceBySku(sku: string): Promise<EvidenceRow[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `
      SELECT
        t.task_number,
        t.task_type,
        t.timestamp,
        t.is_reclaim,
        t.is_unfixed,
        td.customer_name,
        td.customer_province,
        td.product_model,
        td.sku,
        td.product_serial,
        td.issue_description,
        td.issue_group,
        td.ref_task_numbers,
        td.claim_type,
        td.create_date
      FROM tasks t
      JOIN task_details td ON t.id = td.task_id
      WHERE t.status != 'VOIDED'
        AND td.sku = ?
      ORDER BY t.timestamp DESC
    `,
    args: [sku],
  });
  return r.rows.map((row: Record<string, unknown>) => ({
    task_number: String(row.task_number ?? ""),
    task_type: String(row.task_type ?? ""),
    timestamp: row.timestamp != null ? Number(row.timestamp) : null,
    is_reclaim: Number(row.is_reclaim ?? 0),
    is_unfixed: Number(row.is_unfixed ?? 0),
    customer_name: row.customer_name != null ? String(row.customer_name) : null,
    customer_province: row.customer_province != null ? String(row.customer_province) : null,
    product_model: row.product_model != null ? String(row.product_model) : null,
    sku: row.sku != null ? String(row.sku) : null,
    product_serial: row.product_serial != null ? String(row.product_serial) : null,
    issue_description: row.issue_description != null ? String(row.issue_description) : null,
    issue_group: row.issue_group != null ? String(row.issue_group) : null,
    ref_task_numbers: row.ref_task_numbers != null ? String(row.ref_task_numbers) : null,
    claim_type: row.claim_type != null ? String(row.claim_type) : null,
    create_date: row.create_date != null ? String(row.create_date) : null,
  }));
}
