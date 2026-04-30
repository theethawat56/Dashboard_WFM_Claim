import { getDb } from "../db";
import type { EvidenceRow } from "@/types/dashboard";

export async function getEvidenceBySku(
  sku: string,
  opts: {
    dateFrom?: string;
    dateTo?: string;
    warrantyFrom?: string;
    warrantyTo?: string;
  } = {}
): Promise<EvidenceRow[]> {
  const db = getDb();

  const conditions: string[] = [
    "t.status != 'VOIDED'",
    "td.sku = ?",
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const args: any[] = [sku];

  if (opts.dateFrom) {
    const fromMs = new Date(opts.dateFrom).getTime();
    conditions.push("t.timestamp >= ?");
    args.push(fromMs);
  }
  if (opts.dateTo) {
    // include the full dateTo day (end of day)
    const toMs = new Date(opts.dateTo + "T23:59:59.999").getTime();
    conditions.push("t.timestamp <= ?");
    args.push(toMs);
  }
  if (opts.warrantyFrom) {
    const fromMs = new Date(opts.warrantyFrom).getTime();
    conditions.push(
      "td.warranty_start_ts IS NOT NULL AND td.warranty_start_ts >= ?"
    );
    args.push(fromMs);
  }
  if (opts.warrantyTo) {
    const toMs = new Date(opts.warrantyTo + "T23:59:59.999").getTime();
    conditions.push(
      "td.warranty_start_ts IS NOT NULL AND td.warranty_start_ts <= ?"
    );
    args.push(toMs);
  }

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
        td.create_date,
        td.customer_guid,
        td.warranty_id,
        td.warranty_start_date,
        td.warranty_period,
        td.days_to_repair
      FROM tasks t
      JOIN task_details td ON t.id = td.task_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY t.timestamp DESC
    `,
    args,
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
    customer_guid: row.customer_guid != null ? String(row.customer_guid) : null,
    warranty_id: row.warranty_id != null ? String(row.warranty_id) : null,
    warranty_start_date:
      row.warranty_start_date != null ? String(row.warranty_start_date) : null,
    warranty_period: row.warranty_period != null ? String(row.warranty_period) : null,
    days_to_repair: row.days_to_repair != null ? Number(row.days_to_repair) : null,
  }));
}
