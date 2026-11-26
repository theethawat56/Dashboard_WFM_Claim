import { getDb } from "../db";
import { bangkokDate } from "../bangkokDate";
import { sqlDaysToRepairExpr, sqlInWarranty } from "../warrantyBuffer";
import { matchFactoryId } from "./factoryPortalDecisions";
import { confirmedSkuFactories } from "./skuFactoryMap";
import { ensureFactorySubmissions } from "./factorySubmissions";

/** A serial counts only when at least 5 letters or digits remain after stripping fillers. */
export const SQL_REAL_SERIAL = `LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(COALESCE(td.product_serial, ''))), '-', ''), ' ', ''), '.', ''), '/', '')) >= 5`;

const SQL_HAS_SYMPTOM = `NOT (
  TRIM(COALESCE(td.issue_group, '')) = ''
  AND TRIM(COALESCE(td.issue_description, '')) = ''
)`;

let cleaned = false;

function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekStart(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const shift = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + shift);
  return date.toISOString().slice(0, 10);
}

/** Drop send dates the system invented. A real send stores a timestamp, not a bare date. */
async function clearInventedSendDates(): Promise<void> {
  if (cleaned) return;
  await getDb().execute(`
    UPDATE factory_submissions
    SET sent_at = NULL
    WHERE sent_at IS NOT NULL AND instr(sent_at, ':') = 0
  `);
  cleaned = true;
}

/**
 * Once each week, mark ready jobs that opened since the previous run.
 * The first run only includes jobs opened on or after this Monday.
 */
export async function sendNewlyOpenedJobs(): Promise<number> {
  await ensureFactorySubmissions();
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS app_flags (key TEXT PRIMARY KEY, value TEXT)`);
  const today = bangkokDate();
  const thisMonday = weekStart(today);
  const flag = await db.execute({
    sql: `SELECT value FROM app_flags WHERE key = 'monday_auto_send'`,
    args: [],
  });
  const previous = flag.rows[0] ? String((flag.rows[0] as Record<string, unknown>).value ?? "") : "";
  if (previous === thisMonday) return 0;

  const from = previous && previous < thisMonday ? previous : thisMonday;
  const to = previous && previous < thisMonday ? thisMonday : addDays(today, 1);
  const opened = `date(datetime(t.timestamp / 1000, 'unixepoch', '+7 hours'))`;
  const days = sqlDaysToRepairExpr();
  const candidates = await db.execute({
    sql: `
      SELECT t.id, t.task_number, td.sku, m.supplier_name
      FROM tasks t
      JOIN task_details td ON td.task_id = t.id
      LEFT JOIN po_case_matches m ON m.task_id = t.id
      LEFT JOIN (SELECT task_id FROM claim_comp_batch_tasks GROUP BY task_id) bt ON bt.task_id = t.id
      WHERE t.status != 'VOIDED'
        AND bt.task_id IS NULL
        AND ${opened} >= ?
        AND ${opened} < ?
        AND ${days} IS NOT NULL
        AND ${days} <= 365
        AND ${sqlInWarranty()}
        AND ${SQL_REAL_SERIAL}
        AND ${SQL_HAS_SYMPTOM}
        AND NOT EXISTS (SELECT 1 FROM factory_submissions fs WHERE fs.task_id = t.id)
    `,
    args: [from, to],
  });
  const assigned = await confirmedSkuFactories();
  let sent = 0;
  for (const raw of candidates.rows) {
    const row = raw as Record<string, unknown>;
    const sku = String(row.sku ?? "").trim();
    const choice = assigned.get(sku);
    if (choice?.status === "excluded") continue;
    const factoryId = choice?.status === "confirmed" && choice.factoryId
      ? choice.factoryId
      : matchFactoryId(row.supplier_name != null ? String(row.supplier_name) : null);
    if (!factoryId) continue;
    await db.execute({
      sql: `INSERT INTO factory_submissions (task_id, task_number, sent_at) VALUES (?, ?, datetime('now'))
            ON CONFLICT(task_id) DO NOTHING`,
      args: [String(row.id), String(row.task_number ?? "")],
    });
    sent += 1;
  }
  await db.execute({
    sql: `INSERT INTO app_flags (key, value) VALUES ('monday_auto_send', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [thisMonday],
  });
  return sent;
}

/** Keep invented send dates out of the KPI. New jobs are sent from the weekly run. */
export async function syncFactorySentMarks(): Promise<number> {
  await ensureFactorySubmissions();
  await clearInventedSendDates();
  return sendNewlyOpenedJobs();
}
