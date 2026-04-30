import { getDb } from "../db";
import type { TaskListRow } from "@/types/dashboard";

export interface TaskListFilters {
  search?: string;
  type?: "repair" | "claim" | "all";
  sku?: string;
  reclaim?: boolean; // true = reclaim only, false = first-time only, undefined = all
  from?: string; // ISO date YYYY-MM-DD (filters by task timestamp / repair date)
  to?: string;
  warrantyFrom?: string; // ISO date YYYY-MM-DD (filters by warranty_start_date)
  warrantyTo?: string;
  page?: number;
  limit?: number;
}

export interface TaskListResult {
  rows: TaskListRow[];
  total: number;
  page: number;
  limit: number;
}

export async function getTasks(filters: TaskListFilters = {}): Promise<TaskListResult> {
  const db = getDb();
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = ["t.status != 'VOIDED'"];
  const args: (string | number)[] = [];

  if (filters.type && filters.type !== "all") {
    conditions.push("t.task_type = ?");
    args.push(filters.type);
  }
  if (filters.reclaim === true) {
    conditions.push("t.is_reclaim = 1");
  } else if (filters.reclaim === false) {
    conditions.push("(t.is_reclaim = 0 OR t.is_reclaim IS NULL)");
  }
  if (filters.sku) {
    conditions.push("td.sku = ?");
    args.push(filters.sku);
  }
  if (filters.from) {
    const fromMs = new Date(filters.from).getTime();
    conditions.push("t.timestamp >= ?");
    args.push(fromMs);
  }
  if (filters.to) {
    const toEnd = new Date(filters.to);
    toEnd.setHours(23, 59, 59, 999);
    conditions.push("t.timestamp <= ?");
    args.push(toEnd.getTime());
  }
  if (filters.warrantyFrom) {
    const fromMs = new Date(filters.warrantyFrom).getTime();
    conditions.push("td.warranty_start_ts IS NOT NULL AND td.warranty_start_ts >= ?");
    args.push(fromMs);
  }
  if (filters.warrantyTo) {
    const toEnd = new Date(filters.warrantyTo);
    toEnd.setHours(23, 59, 59, 999);
    conditions.push("td.warranty_start_ts IS NOT NULL AND td.warranty_start_ts <= ?");
    args.push(toEnd.getTime());
  }
  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      "(t.task_number LIKE ? OR td.customer_name LIKE ? OR td.product_model LIKE ? OR td.product_serial LIKE ? OR td.sku LIKE ? OR td.warranty_id LIKE ? OR td.customer_guid LIKE ?)"
    );
    args.push(term, term, term, term, term, term, term);
  }

  const where = conditions.join(" AND ");
  const baseSql = `
    FROM tasks t
    LEFT JOIN task_details td ON t.id = td.task_id
    WHERE ${where}
  `;

  const countResult = await db.execute({
    sql: `SELECT COUNT(*) as total ${baseSql}`,
    args,
  });
  const total = Number((countResult.rows[0] as Record<string, unknown>)?.total ?? 0);

  const listResult = await db.execute({
    sql: `
      SELECT
        t.id,
        t.task_number,
        t.task_type,
        t.timestamp,
        t.is_reclaim,
        t.is_unfixed,
        td.customer_name,
        td.product_model,
        td.product_serial,
        td.sku,
        td.issue_description,
        td.issue_group,
        td.create_date,
        td.ref_task_numbers,
        td.customer_guid,
        td.warranty_id,
        td.warranty_start_date,
        td.warranty_period,
        td.days_to_repair
      ${baseSql}
      ORDER BY t.timestamp DESC
      LIMIT ? OFFSET ?
    `,
    args: [...args, limit, offset],
  });

  const rows: TaskListRow[] = listResult.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ""),
    task_number: String(row.task_number ?? ""),
    task_type: (row.task_type === "claim" ? "claim" : "repair") as "repair" | "claim",
    customer_name: row.customer_name != null ? String(row.customer_name) : null,
    product_model: row.product_model != null ? String(row.product_model) : null,
    product_serial: row.product_serial != null ? String(row.product_serial) : null,
    sku: row.sku != null ? String(row.sku) : null,
    issue_description: row.issue_description != null ? String(row.issue_description) : null,
    issue_group: row.issue_group != null ? String(row.issue_group) : null,
    create_date: row.create_date != null ? String(row.create_date) : null,
    timestamp: row.timestamp != null ? Number(row.timestamp) : null,
    is_reclaim: Number(row.is_reclaim ?? 0),
    is_unfixed: Number(row.is_unfixed ?? 0),
    ref_task_numbers: row.ref_task_numbers != null ? String(row.ref_task_numbers) : null,
    customer_guid: row.customer_guid != null ? String(row.customer_guid) : null,
    warranty_id: row.warranty_id != null ? String(row.warranty_id) : null,
    warranty_start_date:
      row.warranty_start_date != null ? String(row.warranty_start_date) : null,
    warranty_period: row.warranty_period != null ? String(row.warranty_period) : null,
    days_to_repair: row.days_to_repair != null ? Number(row.days_to_repair) : null,
  }));

  return { rows, total, page, limit };
}

export async function getDistinctSkus(): Promise<string[]> {
  const db = getDb();
  const r = await db.execute(`
    SELECT DISTINCT td.sku
    FROM task_details td
    JOIN tasks t ON t.id = td.task_id
    WHERE t.status != 'VOIDED' AND td.sku IS NOT NULL AND TRIM(td.sku) != ''
    ORDER BY td.sku
  `);
  return r.rows.map((row: Record<string, unknown>) => String(row.sku ?? ""));
}
