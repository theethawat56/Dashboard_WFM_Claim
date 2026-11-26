import { getDb } from "../db";
import { bangkokDate } from "../bangkokDate";
import { sqlInWarranty } from "../warrantyBuffer";
import { ensureFactorySubmissions } from "./factorySubmissions";

const FACTORY_MATCH = `(
  UPPER(COALESCE(m.supplier_name, '')) LIKE '%MIDEA%'
  OR UPPER(COALESCE(m.supplier_name, '')) LIKE '%JONR%'
  OR UPPER(COALESCE(m.supplier_name, '')) LIKE '%WELLAND%'
  OR UPPER(COALESCE(m.supplier_name, '')) LIKE '%GENHIGH%'
  OR UPPER(COALESCE(m.supplier_name, '')) LIKE '%STC CORPORATION%'
  OR UPPER(COALESCE(m.supplier_name, '')) LIKE '%HIZERO%'
)`;

/** A serial counts only when at least 5 letters or digits remain after stripping fillers. */
export const SQL_REAL_SERIAL = `LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(COALESCE(td.product_serial, ''))), '-', ''), ' ', ''), '.', ''), '/', '')) >= 5`;

const SQL_HAS_SYMPTOM = `NOT (
  TRIM(COALESCE(td.issue_group, '')) = ''
  AND TRIM(COALESCE(td.issue_description, '')) = ''
)`;

let synced = false;

/** Mark jobs that are already on a factory link. The first run dates them from the open date. */
export async function syncFactorySentMarks(): Promise<void> {
  if (synced) return;
  await ensureFactorySubmissions();
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS app_flags (key TEXT PRIMARY KEY, value TEXT)`);
  const flag = await db.execute({
    sql: `SELECT value FROM app_flags WHERE key = 'factory_sent_backfill'`,
    args: [],
  });
  const first = flag.rows.length === 0;
  const today = bangkokDate();
  const yearFrom = `${today.slice(0, 4)}-01-01`;
  const opened = `date(datetime(t.timestamp / 1000, 'unixepoch', '+7 hours'))`;
  const sentAt = first ? opened : "?";
  const args: string[] = first ? [yearFrom, today] : [today, yearFrom, today];

  await db.execute({
    sql: `
      INSERT INTO factory_submissions (task_id, task_number, sent_at)
      SELECT t.id, t.task_number, ${sentAt}
      FROM tasks t
      JOIN task_details td ON td.task_id = t.id
      JOIN po_case_matches m ON m.task_id = t.id
      LEFT JOIN (
        SELECT task_id FROM claim_comp_batch_tasks GROUP BY task_id
      ) bt ON bt.task_id = t.id
      WHERE t.status != 'VOIDED'
        AND bt.task_id IS NULL
        AND ${opened} >= ?
        AND ${opened} <= ?
        AND ${sqlInWarranty()}
        AND ${SQL_REAL_SERIAL}
        AND ${SQL_HAS_SYMPTOM}
        AND ${FACTORY_MATCH}
        AND NOT EXISTS (SELECT 1 FROM factory_submissions fs WHERE fs.task_id = t.id)
    `,
    args,
  });

  await db.execute(`
    INSERT INTO factory_submissions (task_id, task_number, sent_at)
    SELECT t.id, t.task_number, COALESCE(date(d.submitted_at), ${opened})
    FROM factory_portal_decisions d
    JOIN tasks t ON t.id = d.task_id
    JOIN task_details td ON td.task_id = t.id
    WHERE t.status != 'VOIDED'
      AND NOT EXISTS (SELECT 1 FROM factory_submissions fs WHERE fs.task_id = t.id)
  `);

  if (first) {
    await db.execute({
      sql: `INSERT INTO app_flags (key, value) VALUES ('factory_sent_backfill', ?)`,
      args: [new Date().toISOString()],
    });
  }
  synced = true;
}
