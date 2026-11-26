import { getDb } from "../db";

/** Fill WELLAND replacement jobs that are still open with the latest PO unit cost. */
export async function backfillWellandReplacementCosts(): Promise<number> {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS app_flags (key TEXT PRIMARY KEY, value TEXT)`);
  const flag = await db.execute({
    sql: `SELECT value FROM app_flags WHERE key = 'welland_replacement_backfill'`,
    args: [],
  });
  if (flag.rows.length > 0) return 0;

  const costs = await db.execute(`
    SELECT sku, unit_cost FROM (
      SELECT l.sku AS sku, l.unit_cost AS unit_cost,
             ROW_NUMBER() OVER (PARTITION BY l.sku ORDER BY p.po_date DESC, p.id DESC) AS rn
      FROM purchase_order_lines l
      JOIN purchase_orders p ON p.id = l.po_id
      WHERE l.unit_cost IS NOT NULL AND l.unit_cost > 0 AND l.sku IS NOT NULL
    ) WHERE rn = 1
  `);
  const latest = new Map<string, number>();
  for (const raw of costs.rows) {
    const row = raw as Record<string, unknown>;
    latest.set(String(row.sku ?? "").trim(), Number(row.unit_cost ?? 0));
  }

  const jobs = await db.execute(`
    SELECT d.task_id, d.sku, bt.batch_id
    FROM factory_portal_decisions d
    JOIN tasks t ON t.id = d.task_id
    LEFT JOIN claim_comp_batch_tasks bt ON bt.task_id = d.task_id
    WHERE d.factory_id = 'welland'
      AND d.decision = 'approved'
      AND d.comp_type = 'replacement'
      AND t.status != 'VOIDED'
      AND (d.amount IS NULL OR d.amount = 0)
  `);

  let filled = 0;
  for (const raw of jobs.rows) {
    const row = raw as Record<string, unknown>;
    const sku = String(row.sku ?? "").trim();
    const cost = latest.get(sku);
    if (!cost || cost <= 0) continue;
    const taskId = String(row.task_id ?? "");
    await db.execute({
      sql: `UPDATE factory_portal_decisions SET amount = ? WHERE task_id = ?`,
      args: [cost, taskId],
    });
    await db.execute({
      sql: `UPDATE claim_comp_batch_tasks SET amount_per_task = ? WHERE task_id = ?`,
      args: [cost, taskId],
    });
    if (row.batch_id != null) {
      const batchId = Number(row.batch_id);
      await db.execute({
        sql: `UPDATE claim_comp_batches
              SET amount = (SELECT COALESCE(SUM(amount_per_task), 0) FROM claim_comp_batch_tasks WHERE batch_id = ?)
              WHERE id = ?`,
        args: [batchId, batchId],
      });
    }
    filled += 1;
  }

  await db.execute({
    sql: `INSERT INTO app_flags (key, value) VALUES ('welland_replacement_backfill', ?)`,
    args: [new Date().toISOString()],
  });
  return filled;
}
