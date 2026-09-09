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

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY,
  po_number TEXT,
  po_date TEXT,
  po_date_ts INTEGER,
  status TEXT,
  payment_status TEXT,
  supplier_name TEXT,
  supplier_code TEXT,
  reference TEXT,
  total_amount REAL,
  total_quantity REAL,
  payment_amount REAL,
  currency TEXT,
  created_by TEXT,
  payment_term TEXT,
  is_foc INTEGER DEFAULT 0,
  is_foreign INTEGER DEFAULT 0,
  created_at_src TEXT,
  updated_at_src TEXT,
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id INTEGER PRIMARY KEY,
  po_id INTEGER NOT NULL,
  sku TEXT,
  product_name TEXT,
  quantity REAL,
  unit_cost REAL,
  total_price REAL,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id)
);

CREATE INDEX IF NOT EXISTS idx_po_lines_sku ON purchase_order_lines(sku);
CREATE INDEX IF NOT EXISTS idx_po_lines_po_id ON purchase_order_lines(po_id);

CREATE TABLE IF NOT EXISTS po_case_matches (
  task_id TEXT PRIMARY KEY,
  task_number TEXT,
  task_type TEXT,
  sku TEXT,
  supplier_name TEXT,
  ref_date TEXT,
  ref_date_source TEXT,
  match_tier TEXT,
  po_id INTEGER,
  po_number_out TEXT,
  po_date TEXT,
  po_status TEXT,
  po_payment_status TEXT,
  unit_cost REAL,
  po_sku_qty REAL,
  match_note TEXT,
  claims_on_this_po_sku INTEGER,
  claim_rate_pct REAL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_po_matches_sku ON po_case_matches(sku);
CREATE INDEX IF NOT EXISTS idx_po_matches_tier ON po_case_matches(match_tier);
CREATE INDEX IF NOT EXISTS idx_po_matches_po ON po_case_matches(po_id);
