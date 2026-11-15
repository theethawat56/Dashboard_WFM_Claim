import { getDb } from "../db";

export interface DayWorkLog {
  work_date: string;
  claimed_task_numbers: string[];
  claimed_count: number;
  status: "active" | "ended";
  updated_at: string | null;
  ended_at: string | null;
}

async function ensureTable(): Promise<void> {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS day_work_log (
    work_date TEXT PRIMARY KEY,
    claimed_task_numbers TEXT NOT NULL DEFAULT '[]',
    claimed_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    updated_at TEXT,
    ended_at TEXT
  )`);
}

function mapRow(row: Record<string, unknown>): DayWorkLog {
  let numbers: string[] = [];
  try {
    const parsed = JSON.parse(String(row.claimed_task_numbers ?? "[]"));
    if (Array.isArray(parsed)) numbers = parsed.map((n) => String(n));
  } catch {
    numbers = [];
  }
  return {
    work_date: String(row.work_date ?? ""),
    claimed_task_numbers: numbers,
    claimed_count: Number(row.claimed_count ?? numbers.length),
    status: row.status === "ended" ? "ended" : "active",
    updated_at: row.updated_at != null ? String(row.updated_at) : null,
    ended_at: row.ended_at != null ? String(row.ended_at) : null,
  };
}

export async function saveDayWorkLog(input: {
  workDate: string;
  claimedTaskNumbers: string[];
  status: "active" | "ended";
}): Promise<DayWorkLog> {
  await ensureTable();
  const db = getDb();
  const now = new Date().toISOString();
  const unique = Array.from(new Set(input.claimedTaskNumbers.map((n) => n.trim()).filter(Boolean)));
  await db.execute({
    sql: `INSERT INTO day_work_log (work_date, claimed_task_numbers, claimed_count, status, updated_at, ended_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(work_date) DO UPDATE SET
            claimed_task_numbers = excluded.claimed_task_numbers,
            claimed_count = excluded.claimed_count,
            status = excluded.status,
            updated_at = excluded.updated_at,
            ended_at = CASE WHEN excluded.status = 'ended' THEN excluded.ended_at ELSE day_work_log.ended_at END`,
    args: [
      input.workDate,
      JSON.stringify(unique),
      unique.length,
      input.status,
      now,
      input.status === "ended" ? now : null,
    ],
  });
  return {
    work_date: input.workDate,
    claimed_task_numbers: unique,
    claimed_count: unique.length,
    status: input.status,
    updated_at: now,
    ended_at: input.status === "ended" ? now : null,
  };
}

export async function getRecentDayLogs(limit = 7): Promise<DayWorkLog[]> {
  await ensureTable();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT work_date, claimed_task_numbers, claimed_count, status, updated_at, ended_at
          FROM day_work_log
          ORDER BY work_date DESC
          LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((row) => mapRow(row as Record<string, unknown>));
}
