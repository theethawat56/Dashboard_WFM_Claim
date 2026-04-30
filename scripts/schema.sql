-- Run this manually if npm run migrate fails with HTTP 400 (e.g. read-only token).
-- In Turso dashboard: SQL → paste and run. Or: npm run db:setup (uses Turso CLI)

CREATE TABLE IF NOT EXISTS tasks (
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
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_details (
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
  customer_guid TEXT,
  warranty_id TEXT,
  warranty_start_date TEXT,
  warranty_start_ts INTEGER,
  warranty_period TEXT,
  warranty_order_number TEXT,
  warranty_serial TEXT,
  days_to_repair INTEGER,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS sync_log (
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
);

-- Auto/scheduler metadata (last run times, flags)
CREATE TABLE IF NOT EXISTS auto_sync_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS claim_comp_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL,
  comp_type TEXT NOT NULL,
  amount REAL DEFAULT 0,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS claim_comp_batch_tasks (
  batch_id INTEGER NOT NULL,
  task_id TEXT NOT NULL,
  task_number TEXT NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES claim_comp_batches(id) ON DELETE CASCADE
);
