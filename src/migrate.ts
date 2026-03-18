import { db } from "./db";

// Minimal columns first for compatibility; Turso may reject certain DEFAULTs or constraints
const TABLE_TASKS = `CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  task_number TEXT NOT NULL,
  task_type TEXT,
  workflow_id TEXT,
  status TEXT,
  company TEXT,
  timestamp INTEGER,
  updated_timestamp INTEGER,
  is_reclaim INTEGER DEFAULT 0,
  is_unfixed INTEGER DEFAULT 0,
  parent_ids TEXT,
  created_at TEXT
)`;

const TABLE_TASK_DETAILS = `CREATE TABLE IF NOT EXISTS task_details (
  task_id TEXT PRIMARY KEY,
  customer_name TEXT,
  customer_phone TEXT,
  customer_province TEXT,
  product_model TEXT,
  product_serial TEXT,
  issue_description TEXT,
  shipping_option TEXT,
  create_date TEXT,
  ref_numbers TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
)`;

const TABLE_SYNC_LOG = `CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_type TEXT,
  workflow_ids TEXT,
  started_at TEXT,
  finished_at TEXT,
  repair_fetched INTEGER,
  claim_fetched INTEGER,
  total_upserted INTEGER,
  status TEXT,
  error_message TEXT
)`;

const TABLE_AUTO_SYNC_STATE = `CREATE TABLE IF NOT EXISTS auto_sync_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
)`;

const STATEMENTS: Array<{ name: string; sql: string }> = [
  { name: "tasks", sql: TABLE_TASKS },
  { name: "task_details", sql: TABLE_TASK_DETAILS },
  { name: "sync_log", sql: TABLE_SYNC_LOG },
  { name: "auto_sync_state", sql: TABLE_AUTO_SYNC_STATE },
];

// Expected new columns: table -> column -> full ALTER SQL (no IF NOT EXISTS for compatibility)
const NEW_COLUMNS: Array<{ table: string; column: string; sql: string }> = [
  { table: "task_details", column: "sku", sql: "ALTER TABLE task_details ADD COLUMN sku TEXT DEFAULT ''" },
  { table: "task_details", column: "issue_group", sql: "ALTER TABLE task_details ADD COLUMN issue_group TEXT DEFAULT ''" },
  { table: "task_details", column: "is_reclaim", sql: "ALTER TABLE task_details ADD COLUMN is_reclaim INTEGER DEFAULT 0" },
  { table: "task_details", column: "ref_task_numbers", sql: "ALTER TABLE task_details ADD COLUMN ref_task_numbers TEXT DEFAULT ''" },
  { table: "task_details", column: "claim_type", sql: "ALTER TABLE task_details ADD COLUMN claim_type TEXT DEFAULT ''" },
  { table: "sync_log", column: "sku_fetched", sql: "ALTER TABLE sync_log ADD COLUMN sku_fetched INTEGER DEFAULT 0" },
  { table: "sync_log", column: "sku_failed", sql: "ALTER TABLE sync_log ADD COLUMN sku_failed INTEGER DEFAULT 0" },
];

const ALLOWED_TABLES = new Set(["task_details", "sync_log"]);

async function getExistingColumns(tableName: string): Promise<Set<string>> {
  const names = new Set<string>();
  if (!ALLOWED_TABLES.has(tableName)) return names;
  try {
    const r = await db.execute(`PRAGMA table_info("${tableName.replace(/"/g, '""')}")`);
    for (const row of r.rows) {
      const name = (row as { name?: string }).name;
      if (name) names.add(name);
    }
  } catch {
    // Table might not exist
  }
  return names;
}

async function runAlterStatements(): Promise<void> {
  const tables = Array.from(new Set(NEW_COLUMNS.map((c) => c.table)));
  const existingByTable = new Map<string, Set<string>>();
  for (const table of tables) {
    existingByTable.set(table, await getExistingColumns(table));
  }
  for (const { table, column, sql } of NEW_COLUMNS) {
    const existing = existingByTable.get(table);
    if (existing?.has(column)) continue;
    try {
      await db.execute(sql);
    } catch (err) {
      console.warn("[migrate] ALTER TABLE failed (column may already exist):", sql, err);
    }
  }
}

/**
 * Ensure expected columns exist by running ALTER TABLE only for missing columns.
 * Call this before sync so that if code expects new columns (e.g. sku_fetched),
 * they are auto-added when missing. Safe to call every run.
 */
export async function ensureNewColumns(): Promise<void> {
  try {
    await runAlterStatements();
  } catch (err) {
    console.warn("[migrate] ensureNewColumns failed (non-fatal):", err);
  }
}

function is400(err: unknown): boolean {
  const cause =
    err && typeof err === "object" && "cause" in err
      ? (err as { cause?: { status?: number } }).cause
      : null;
  return cause?.status === 400 || (err as { status?: number })?.status === 400;
}

const REQUIRED_TABLES = ["tasks", "task_details", "sync_log", "auto_sync_state"];
const TABLE_CHECK_SQL =
  "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name IN ('tasks','task_details','sync_log','auto_sync_state')";

/** Returns true if all required tables exist. */
export async function tablesExist(): Promise<boolean> {
  const r = await db.execute(TABLE_CHECK_SQL);
  const row = r.rows[0] as { c?: number } | undefined;
  return Number(row?.c ?? 0) === REQUIRED_TABLES.length;
}

const MIGRATE_400_MESSAGE =
  "[migrate] Turso returned 400 (DDL may be disabled or token read-only).\n" +
  "  Create tables manually: open Turso dashboard → your database → SQL, then paste and run the contents of scripts/schema.sql.\n" +
  "  Or: turso db shell <your-db-name> < scripts/schema.sql\n" +
  "  Then run this app again.";

export async function migrate(): Promise<void> {
  try {
    await db.migrate(STATEMENTS.map((s) => s.sql));
    await runAlterStatements();
    console.log("[migrate] Schema applied successfully.");
    return;
  } catch (migrateErr) {
    if (!is400(migrateErr)) throw migrateErr;

    console.warn("[migrate] DDL failed with 400, checking if tables already exist...");
    try {
      const exist = await tablesExist();
      if (exist) {
        console.log("[migrate] Tables already exist, skipping migration.");
        await runAlterStatements();
        return;
      }
    } catch {
      // check failed, fall through to exit with instructions
    }
    console.error(MIGRATE_400_MESSAGE);
    throw migrateErr;
  }
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
