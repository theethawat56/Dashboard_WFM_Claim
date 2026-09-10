import { getDb } from "../db";
import { resolveFactorySkus, skuInSql } from "../factoryClaimSkus";
import { ensureNewColumns } from "../migrate";
import { isTaskClosed, SQL_NOT_VOIDED } from "../taskStatus";
import type {
  ClaimTrackingData,
  ClaimTrackingKpis,
  ClaimTrackingRow,
  PoMatchTier,
  WarrantyBucket,
} from "@/types/dashboard";

const WARRANTY_DAYS = 365;

function bangkokMonth(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).slice(0, 7);
}

export function resolveClaimMonth(raw?: string | null): string {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) return raw;
  return bangkokMonth();
}

function isMissingSerial(value: string | null): boolean {
  const t = (value ?? "").trim();
  if (!t) return true;
  const lower = t.toLowerCase();
  return t === "-" || lower === "n/a" || lower === "none" || lower === "null";
}

function isMissingSymptom(group: string | null, desc: string | null): boolean {
  return !(group ?? "").trim() && !(desc ?? "").trim();
}

function warrantyBucket(days: number | null): WarrantyBucket {
  if (days == null) return "unknown";
  return days <= WARRANTY_DAYS ? "in" : "out";
}

async function ensureCompTables(): Promise<void> {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS claim_comp_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL,
    comp_type TEXT NOT NULL,
    amount REAL DEFAULT 0,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS claim_comp_batch_tasks (
    batch_id INTEGER NOT NULL,
    task_id TEXT NOT NULL,
    task_number TEXT NOT NULL,
    FOREIGN KEY (batch_id) REFERENCES claim_comp_batches(id) ON DELETE CASCADE
  )`);
}

export async function getClaimTracking(monthRaw?: string | null): Promise<ClaimTrackingData> {
  await ensureNewColumns();
  await ensureCompTables();
  const db = getDb();
  const month = resolveClaimMonth(monthRaw);
  const skuFilter = skuInSql("td.sku", resolveFactorySkus(null));
  const monthExpr = `strftime('%Y-%m', datetime(t.timestamp / 1000, 'unixepoch', '+7 hours'))`;
  const daysExpr = `CASE
    WHEN td.warranty_start_date IS NOT NULL AND TRIM(td.warranty_start_date) != ''
    THEN CAST(
      julianday(date(datetime(t.timestamp / 1000, 'unixepoch', '+7 hours')))
      - julianday(td.warranty_start_date)
    AS INTEGER)
    ELSE td.days_to_repair
  END`;

  const list = await db.execute({
    sql: `
      SELECT
        t.id,
        t.task_number,
        t.task_type,
        t.status,
        t.timestamp,
        td.sku,
        td.product_model,
        td.product_serial,
        td.issue_description,
        td.issue_group,
        td.create_date,
        td.warranty_start_date,
        ${daysExpr} as days_from_register,
        CASE WHEN bt.task_id IS NOT NULL THEN 1 ELSE 0 END as factory_recorded,
        bt.recorded_amount,
        m.unit_cost,
        m.match_tier
      FROM tasks t
      LEFT JOIN task_details td ON td.task_id = t.id
      LEFT JOIN (
        SELECT bt.task_id, SUM(b.amount) as recorded_amount
        FROM claim_comp_batch_tasks bt
        JOIN claim_comp_batches b ON b.id = bt.batch_id
        GROUP BY bt.task_id
      ) bt ON bt.task_id = t.id
      LEFT JOIN po_case_matches m ON m.task_id = t.id
      WHERE ${SQL_NOT_VOIDED}
        AND ${skuFilter.sql}
        AND ${monthExpr} = ?
      ORDER BY t.timestamp DESC, t.task_number DESC
    `,
    args: [...skuFilter.args, month],
  });

  const rows: ClaimTrackingRow[] = (list.rows as Record<string, unknown>[]).map((row) => {
    const serial = row.product_serial != null ? String(row.product_serial) : null;
    const group = row.issue_group != null ? String(row.issue_group) : null;
    const desc = row.issue_description != null ? String(row.issue_description) : null;
    const days = row.days_from_register != null ? Number(row.days_from_register) : null;
    const sku = row.sku != null ? String(row.sku).trim() : "";
    const model = row.product_model != null ? String(row.product_model).trim() : "";
    const taskType = row.task_type === "repair" ? "repair" : "claim";
    const status = row.status != null ? String(row.status) : null;
    const matchTier = row.match_tier != null ? (String(row.match_tier) as PoMatchTier) : null;
    return {
      id: String(row.id ?? ""),
      task_number: String(row.task_number ?? ""),
      task_type: taskType,
      status,
      is_closed: isTaskClosed(taskType, status),
      sku: sku || null,
      product_name: model || sku || null,
      product_serial: serial,
      issue_description: desc,
      issue_group: group,
      create_date: row.create_date != null ? String(row.create_date) : null,
      timestamp: row.timestamp != null ? Number(row.timestamp) : null,
      warranty_start_date: row.warranty_start_date != null ? String(row.warranty_start_date) : null,
      days_from_register: days,
      warranty_bucket: warrantyBucket(Number.isFinite(days as number) ? days : null),
      missing_serial: isMissingSerial(serial),
      missing_symptom: isMissingSymptom(group, desc),
      factory_recorded: Number(row.factory_recorded ?? 0) === 1,
      recorded_amount: row.recorded_amount != null ? Number(row.recorded_amount) : null,
      unit_cost: row.unit_cost != null ? Number(row.unit_cost) : null,
      match_tier: matchTier,
    };
  });

  const recorded = await db.execute({
    sql: `
      SELECT COALESCE(SUM(b.amount), 0) as amt
      FROM claim_comp_batches b
      WHERE b.id IN (
        SELECT DISTINCT bt.batch_id
        FROM claim_comp_batch_tasks bt
        JOIN tasks t ON t.id = bt.task_id
        JOIN task_details td ON td.task_id = t.id
        WHERE ${SQL_NOT_VOIDED}
          AND ${skuFilter.sql}
          AND ${monthExpr} = ?
      )
    `,
    args: [...skuFilter.args, month],
  });

  const monthValue = rows.reduce((sum, r) => {
    if (r.match_tier && r.match_tier !== "gray" && r.unit_cost != null) return sum + r.unit_cost;
    return sum;
  }, 0);

  const kpis: ClaimTrackingKpis = {
    month,
    total: rows.length,
    in_warranty: rows.filter((r) => r.warranty_bucket === "in").length,
    out_warranty: rows.filter((r) => r.warranty_bucket === "out").length,
    unknown_warranty: rows.filter((r) => r.warranty_bucket === "unknown").length,
    closed: rows.filter((r) => r.is_closed).length,
    factory_recorded: rows.filter((r) => r.factory_recorded).length,
    month_value: monthValue,
    recorded_value: Number((recorded.rows[0] as { amt?: number } | undefined)?.amt ?? 0),
    missing_serial: rows.filter((r) => r.missing_serial).length,
    missing_symptom: rows.filter((r) => r.missing_symptom).length,
  };

  const monthsRes = await db.execute({
    sql: `
    SELECT DISTINCT ${monthExpr} as m
    FROM tasks t
    JOIN task_details td ON td.task_id = t.id
    WHERE ${SQL_NOT_VOIDED} AND t.timestamp IS NOT NULL AND ${skuFilter.sql}
    ORDER BY m DESC
  `,
    args: skuFilter.args,
  });
  const months = (monthsRes.rows as { m?: string }[])
    .map((r) => String(r.m ?? ""))
    .filter((m) => /^\d{4}-\d{2}$/.test(m));
  if (!months.includes(month)) months.unshift(month);

  return { kpis, rows, months };
}
