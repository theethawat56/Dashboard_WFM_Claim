import { getDb } from "./db";

/**
 * Schema migrations for the web app.
 *
 * The CLI tool in ../../../src/migrate.ts owns the canonical schema. This file
 * mirrors its `ensureNewColumns()` logic so the deployed Next.js app (Vercel)
 * can self-heal when it boots against a Turso database that pre-dates a
 * column added in a later release.
 *
 * Behaviour:
 *  - Idempotent: existing columns are skipped via PRAGMA table_info().
 *  - Best-effort: ALTER errors are logged and swallowed so a transient
 *    failure can't take down read-only API routes.
 *  - Cached per cold start: once a Vercel function instance has migrated
 *    successfully, subsequent calls are no-ops.
 */

interface ColumnSpec {
  table: "task_details" | "sync_log";
  column: string;
  sql: string;
}

const NEW_COLUMNS: ColumnSpec[] = [
  { table: "task_details", column: "sku", sql: "ALTER TABLE task_details ADD COLUMN sku TEXT DEFAULT ''" },
  { table: "task_details", column: "issue_group", sql: "ALTER TABLE task_details ADD COLUMN issue_group TEXT DEFAULT ''" },
  { table: "task_details", column: "is_reclaim", sql: "ALTER TABLE task_details ADD COLUMN is_reclaim INTEGER DEFAULT 0" },
  { table: "task_details", column: "ref_task_numbers", sql: "ALTER TABLE task_details ADD COLUMN ref_task_numbers TEXT DEFAULT ''" },
  { table: "task_details", column: "claim_type", sql: "ALTER TABLE task_details ADD COLUMN claim_type TEXT DEFAULT ''" },
  { table: "task_details", column: "customer_guid", sql: "ALTER TABLE task_details ADD COLUMN customer_guid TEXT" },
  { table: "task_details", column: "warranty_id", sql: "ALTER TABLE task_details ADD COLUMN warranty_id TEXT" },
  { table: "task_details", column: "warranty_start_date", sql: "ALTER TABLE task_details ADD COLUMN warranty_start_date TEXT" },
  { table: "task_details", column: "warranty_start_ts", sql: "ALTER TABLE task_details ADD COLUMN warranty_start_ts INTEGER" },
  { table: "task_details", column: "warranty_period", sql: "ALTER TABLE task_details ADD COLUMN warranty_period TEXT" },
  { table: "task_details", column: "warranty_order_number", sql: "ALTER TABLE task_details ADD COLUMN warranty_order_number TEXT" },
  { table: "task_details", column: "warranty_serial", sql: "ALTER TABLE task_details ADD COLUMN warranty_serial TEXT" },
  { table: "task_details", column: "days_to_repair", sql: "ALTER TABLE task_details ADD COLUMN days_to_repair INTEGER" },
  { table: "sync_log", column: "sku_fetched", sql: "ALTER TABLE sync_log ADD COLUMN sku_fetched INTEGER DEFAULT 0" },
  { table: "sync_log", column: "sku_failed", sql: "ALTER TABLE sync_log ADD COLUMN sku_failed INTEGER DEFAULT 0" },
  { table: "sync_log", column: "warranty_fetched", sql: "ALTER TABLE sync_log ADD COLUMN warranty_fetched INTEGER DEFAULT 0" },
  { table: "sync_log", column: "warranty_failed", sql: "ALTER TABLE sync_log ADD COLUMN warranty_failed INTEGER DEFAULT 0" },
];

const ALLOWED_TABLES = new Set<ColumnSpec["table"]>([
  "task_details",
  "sync_log",
]);

export interface MigrateReport {
  added: string[];
  skipped: string[];
  failed: { column: string; error: string }[];
}

async function getExistingColumns(
  table: ColumnSpec["table"]
): Promise<Set<string>> {
  const names = new Set<string>();
  if (!ALLOWED_TABLES.has(table)) return names;
  try {
    const db = getDb();
    // PRAGMA does not support bound parameters; the table name is restricted
    // to the ALLOWED_TABLES set above so this template is safe.
    const r = await db.execute(`PRAGMA table_info("${table}")`);
    for (const row of r.rows) {
      const name = (row as { name?: string }).name;
      if (name) names.add(name);
    }
  } catch {
    // Table may not exist yet (fresh DB); treat as empty set.
  }
  return names;
}

async function runEnsure(): Promise<MigrateReport> {
  const db = getDb();
  const report: MigrateReport = { added: [], skipped: [], failed: [] };

  const tables = Array.from(new Set(NEW_COLUMNS.map((c) => c.table)));
  const existingByTable = new Map<ColumnSpec["table"], Set<string>>();
  for (const t of tables) {
    existingByTable.set(t, await getExistingColumns(t));
  }

  for (const { table, column, sql } of NEW_COLUMNS) {
    const existing = existingByTable.get(table);
    const fqcn = `${table}.${column}`;
    if (existing?.has(column)) {
      report.skipped.push(fqcn);
      continue;
    }
    try {
      await db.execute(sql);
      existing?.add(column);
      report.added.push(fqcn);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.failed.push({ column: fqcn, error: msg });
      console.warn(`[migrate] ALTER TABLE failed for ${fqcn}: ${msg}`);
    }
  }

  return report;
}

let cachedPromise: Promise<MigrateReport> | null = null;

/**
 * Ensure all expected columns exist on the live database.
 * Caches the in-flight / completed promise per cold start so concurrent
 * callers share one round-trip. Pass `force: true` to re-run regardless.
 */
export async function ensureNewColumns(opts: { force?: boolean } = {}): Promise<MigrateReport> {
  if (opts.force) cachedPromise = null;
  if (!cachedPromise) {
    cachedPromise = runEnsure().catch((err) => {
      cachedPromise = null;
      throw err;
    });
  }
  return cachedPromise;
}
