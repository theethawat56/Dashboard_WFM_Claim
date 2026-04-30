import { getDb } from "../db";
import type {
  ClaimCompBatch,
  ClaimCompSkuRow,
  ClaimCompOverall,
  CompType,
  SkuTaskForBatch,
} from "@/types/dashboard";

const ENSURE_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS claim_comp_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL,
    comp_type TEXT NOT NULL,
    amount REAL DEFAULT 0,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS claim_comp_batch_tasks (
    batch_id INTEGER NOT NULL,
    task_id TEXT NOT NULL,
    task_number TEXT NOT NULL,
    FOREIGN KEY (batch_id) REFERENCES claim_comp_batches(id) ON DELETE CASCADE
  )`,
];

let tablesEnsured = false;

async function ensureTables() {
  if (tablesEnsured) return;
  const db = getDb();
  for (const sql of ENSURE_TABLES_SQL) await db.execute(sql);
  tablesEnsured = true;
}

// ── Insert a batch (1 compensation entry + N linked tasks) ──────────

export async function insertBatch(data: {
  sku: string;
  comp_type: CompType;
  amount: number;
  note: string | null;
  tasks: { task_id: string; task_number: string }[];
}): Promise<number> {
  await ensureTables();
  const db = getDb();
  const r = await db.execute({
    sql: `INSERT INTO claim_comp_batches (sku, comp_type, amount, note) VALUES (?, ?, ?, ?)`,
    args: [data.sku, data.comp_type, data.amount, data.note],
  });
  const batchId = Number(r.lastInsertRowid ?? 0);

  for (const t of data.tasks) {
    await db.execute({
      sql: `INSERT INTO claim_comp_batch_tasks (batch_id, task_id, task_number) VALUES (?, ?, ?)`,
      args: [batchId, t.task_id, t.task_number],
    });
  }
  return batchId;
}

// ── Delete a batch ──────────────────────────────────────────────────

export async function deleteBatch(id: number): Promise<void> {
  await ensureTables();
  const db = getDb();
  await db.execute({ sql: `DELETE FROM claim_comp_batch_tasks WHERE batch_id = ?`, args: [id] });
  await db.execute({ sql: `DELETE FROM claim_comp_batches WHERE id = ?`, args: [id] });
}

// ── Get all batches for a SKU ───────────────────────────────────────

export async function getBatchesBySku(sku: string): Promise<ClaimCompBatch[]> {
  await ensureTables();
  const db = getDb();

  const r = await db.execute({
    sql: `SELECT * FROM claim_comp_batches WHERE sku = ? ORDER BY created_at DESC`,
    args: [sku],
  });

  const batches: ClaimCompBatch[] = [];
  for (const row of r.rows) {
    const rr = row as Record<string, unknown>;
    const batchId = Number(rr.id);
    const tasks = await db.execute({
      sql: `SELECT task_number FROM claim_comp_batch_tasks WHERE batch_id = ?`,
      args: [batchId],
    });
    batches.push({
      id: batchId,
      sku: String(rr.sku ?? ""),
      comp_type: String(rr.comp_type ?? "cost_refund") as CompType,
      amount: Number(rr.amount ?? 0),
      note: rr.note != null ? String(rr.note) : null,
      created_at: String(rr.created_at ?? ""),
      task_numbers: tasks.rows.map((t) => String((t as Record<string, unknown>).task_number ?? "")),
    });
  }
  return batches;
}

// ── Get all compensated task numbers (for TaskListTable badge) ───────

export async function getCompensatedTaskNumbers(): Promise<Map<string, number>> {
  await ensureTables();
  const db = getDb();
  const r = await db.execute({
    sql: `
      SELECT bt.task_number, SUM(b.amount) as total
      FROM claim_comp_batch_tasks bt
      JOIN claim_comp_batches b ON b.id = bt.batch_id
      GROUP BY bt.task_number
    `,
    args: [],
  });
  const map = new Map<string, number>();
  for (const row of r.rows) {
    const rr = row as Record<string, unknown>;
    map.set(String(rr.task_number), Number(rr.total ?? 0));
  }
  return map;
}

// ── Per-SKU summary (for the new "ผลเคลม" tab table) ────────────────

export async function getCompSkuSummary(): Promise<ClaimCompSkuRow[]> {
  await ensureTables();
  const db = getDb();

  const r = await db.execute({
    sql: `
      SELECT
        b.sku,
        COALESCE(td.product_model, '') as model,
        SUM(b.amount) as total_amount,
        SUM(CASE WHEN b.comp_type = 'cost_refund'  THEN b.amount ELSE 0 END) as cost_refund,
        SUM(CASE WHEN b.comp_type = 'spare_parts'  THEN b.amount ELSE 0 END) as spare_parts,
        SUM(CASE WHEN b.comp_type = 'deduce'       THEN b.amount ELSE 0 END) as deduce,
        SUM(CASE WHEN b.comp_type = 'replacement'  THEN b.amount ELSE 0 END) as replacement,
        COUNT(DISTINCT b.id) as batch_count
      FROM claim_comp_batches b
      LEFT JOIN task_details td ON td.task_id = (
        SELECT bt2.task_id FROM claim_comp_batch_tasks bt2
        WHERE bt2.batch_id = b.id LIMIT 1
      )
      WHERE b.sku IS NOT NULL AND TRIM(b.sku) != ''
      GROUP BY b.sku
      ORDER BY total_amount DESC
    `,
    args: [],
  });

  const skuRows: ClaimCompSkuRow[] = [];
  for (const row of r.rows) {
    const rr = row as Record<string, unknown>;
    const sku = String(rr.sku ?? "");

    const [taskCountRes, compTaskRes] = await Promise.all([
      db.execute({
        sql: `
          SELECT COUNT(*) as cnt FROM tasks t
          JOIN task_details td ON t.id = td.task_id
          WHERE t.status != 'VOIDED' AND td.sku = ?
        `,
        args: [sku],
      }),
      db.execute({
        sql: `
          SELECT COUNT(DISTINCT bt.task_number) as cnt
          FROM claim_comp_batch_tasks bt
          JOIN claim_comp_batches b ON b.id = bt.batch_id
          WHERE b.sku = ?
        `,
        args: [sku],
      }),
    ]);

    skuRows.push({
      sku,
      model: String(rr.model ?? ""),
      total_tasks: Number((taskCountRes.rows[0] as Record<string, unknown>).cnt ?? 0),
      compensated_tasks: Number((compTaskRes.rows[0] as Record<string, unknown>).cnt ?? 0),
      total_amount: Number(rr.total_amount ?? 0),
      cost_refund: Number(rr.cost_refund ?? 0),
      spare_parts: Number(rr.spare_parts ?? 0),
      deduce: Number(rr.deduce ?? 0),
      replacement: Number(rr.replacement ?? 0),
      batch_count: Number(rr.batch_count ?? 0),
    });
  }
  return skuRows;
}

// ── Overall summary (for overview card) ─────────────────────────────

export async function getCompOverall(): Promise<ClaimCompOverall> {
  await ensureTables();
  const db = getDb();

  const [totals, taskCount, topSkus] = await Promise.all([
    db.execute({
      sql: `
        SELECT
          COALESCE(SUM(amount), 0) as total_amount,
          COALESCE(SUM(CASE WHEN comp_type = 'cost_refund'  THEN amount ELSE 0 END), 0) as cost_refund,
          COALESCE(SUM(CASE WHEN comp_type = 'spare_parts'  THEN amount ELSE 0 END), 0) as spare_parts,
          COALESCE(SUM(CASE WHEN comp_type = 'deduce'       THEN amount ELSE 0 END), 0) as deduce,
          COALESCE(SUM(CASE WHEN comp_type = 'replacement'  THEN amount ELSE 0 END), 0) as replacement
        FROM claim_comp_batches
      `,
      args: [],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as cnt FROM tasks WHERE status != 'VOIDED'`,
      args: [],
    }),
    db.execute({
      sql: `
        SELECT b.sku, COALESCE(td.product_model, '') as model, SUM(b.amount) as total_amount
        FROM claim_comp_batches b
        LEFT JOIN task_details td ON td.task_id = (
          SELECT bt2.task_id FROM claim_comp_batch_tasks bt2 WHERE bt2.batch_id = b.id LIMIT 1
        )
        WHERE b.sku IS NOT NULL AND TRIM(b.sku) != ''
        GROUP BY b.sku
        ORDER BY total_amount DESC
        LIMIT 5
      `,
      args: [],
    }),
  ]);

  const t = totals.rows[0] as Record<string, unknown>;

  const compTaskCount = await db.execute({
    sql: `SELECT COUNT(DISTINCT task_number) as cnt FROM claim_comp_batch_tasks`,
    args: [],
  });

  return {
    total_amount: Number(t.total_amount ?? 0),
    cost_refund: Number(t.cost_refund ?? 0),
    spare_parts: Number(t.spare_parts ?? 0),
    deduce: Number(t.deduce ?? 0),
    replacement: Number(t.replacement ?? 0),
    compensated_task_count: Number((compTaskCount.rows[0] as Record<string, unknown>).cnt ?? 0),
    total_claim_task_count: Number((taskCount.rows[0] as Record<string, unknown>).cnt ?? 0),
    top_skus: topSkus.rows.map((row: Record<string, unknown>) => ({
      sku: String(row.sku ?? ""),
      model: String(row.model ?? ""),
      total_amount: Number(row.total_amount ?? 0),
    })),
  };
}

// ── Get tasks for a SKU (for batch dialog checkbox list) ────────────

export async function getTasksForSku(sku: string): Promise<SkuTaskForBatch[]> {
  await ensureTables();
  const db = getDb();

  const r = await db.execute({
    sql: `
      SELECT t.id as task_id, t.task_number, t.task_type, t.timestamp, t.is_reclaim
      FROM tasks t
      JOIN task_details td ON t.id = td.task_id
      WHERE t.status != 'VOIDED' AND td.sku = ?
      ORDER BY t.timestamp DESC
    `,
    args: [sku],
  });

  const compensated = await db.execute({
    sql: `
      SELECT DISTINCT bt.task_number
      FROM claim_comp_batch_tasks bt
      JOIN claim_comp_batches b ON b.id = bt.batch_id
      WHERE b.sku = ?
    `,
    args: [sku],
  });
  const compSet = new Set(compensated.rows.map((r2) => String((r2 as Record<string, unknown>).task_number)));

  return r.rows.map((row: Record<string, unknown>) => ({
    task_id: String(row.task_id ?? ""),
    task_number: String(row.task_number ?? ""),
    task_type: String(row.task_type ?? ""),
    timestamp: row.timestamp != null ? Number(row.timestamp) : null,
    is_reclaim: Number(row.is_reclaim ?? 0),
    already_compensated: compSet.has(String(row.task_number ?? "")),
  }));
}
