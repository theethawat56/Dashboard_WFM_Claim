import { getDb } from "../db";

const ENSURE_SQL = `CREATE TABLE IF NOT EXISTS factory_submissions (
  task_id TEXT PRIMARY KEY,
  task_number TEXT NOT NULL,
  sent_at TEXT DEFAULT (datetime('now'))
)`;

let ensured = false;

export async function ensureFactorySubmissions(): Promise<void> {
  if (ensured) return;
  await getDb().execute(ENSURE_SQL);
  ensured = true;
}

/** Mark a job as sent to the factory, or clear that mark. Compensation records are separate. */
export async function toggleFactorySubmission(input: {
  taskId: string;
  taskNumber: string;
}): Promise<boolean> {
  await ensureFactorySubmissions();
  const db = getDb();
  const existing = await db.execute({
    sql: `SELECT task_id FROM factory_submissions WHERE task_id = ?`,
    args: [input.taskId],
  });
  if (existing.rows.length > 0) {
    await db.execute({
      sql: `DELETE FROM factory_submissions WHERE task_id = ?`,
      args: [input.taskId],
    });
    return false;
  }
  await db.execute({
    sql: `INSERT INTO factory_submissions (task_id, task_number) VALUES (?, ?)`,
    args: [input.taskId, input.taskNumber],
  });
  return true;
}
