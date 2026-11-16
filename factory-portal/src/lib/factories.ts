import { randomBytes, timingSafeEqual } from "crypto";
import { getDb } from "./db";

/** Keep this list in sync with web/src/lib/queries/factoryPortalDecisions.ts */
export const FACTORIES: { id: string; name: string; match: string }[] = [
  { id: "midea", name: "MIDEA ELECTRIC TRADING (SINGAPORE) CO. PTE. LTD.", match: "MIDEA" },
  { id: "jonr", name: "SUZHOU JONR TECHNOLOGY CO., LTD", match: "JONR" },
  { id: "welland", name: "Guangdong Welland Technology Co., Ltd", match: "WELLAND" },
  { id: "genhigh", name: "GENHIGH TECH CO.,LTD", match: "GENHIGH" },
  { id: "stc", name: "STC CORPORATION LIMITED", match: "STC CORPORATION" },
  { id: "hizero", name: "HIZERO HK LIMITED", match: "HIZERO" },
];

export type FactoryRecord = {
  id: string;
  name: string;
  match: string;
  accessToken: string;
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS factory_portal_factories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    match_key TEXT NOT NULL,
    access_token TEXT NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS factory_portal_decisions (
    task_id TEXT PRIMARY KEY,
    factory_id TEXT NOT NULL,
    task_number TEXT NOT NULL,
    sku TEXT,
    decision TEXT NOT NULL,
    comp_type TEXT,
    amount REAL,
    note TEXT,
    reason TEXT,
    status TEXT NOT NULL,
    submitted_at TEXT,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS factory_portal_translations (
    source_text TEXT PRIMARY KEY,
    english_text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS factory_portal_email_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    dedupe_key TEXT NOT NULL UNIQUE,
    subject TEXT,
    sent_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS factory_portal_state (
    key TEXT PRIMARY KEY,
    value TEXT
  )`,
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

let ready = false;

export async function ensurePortal(): Promise<void> {
  if (ready) return;
  const db = getDb();
  for (const sql of SCHEMA) await db.execute(sql);
  for (const factory of FACTORIES) {
    const token = randomBytes(24).toString("hex");
    await db.execute({
      sql: `INSERT INTO factory_portal_factories (id, name, match_key, access_token)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, match_key = excluded.match_key`,
      args: [factory.id, factory.name, factory.match, token],
    });
  }
  ready = true;
}

export function matchFactoryId(supplierName: string | null | undefined): string | null {
  const upper = (supplierName ?? "").toUpperCase();
  if (!upper.trim()) return null;
  for (const factory of FACTORIES) {
    if (upper.includes(factory.match)) return factory.id;
  }
  return null;
}

export async function listFactories(): Promise<FactoryRecord[]> {
  await ensurePortal();
  const result = await getDb().execute(
    `SELECT id, name, match_key, access_token FROM factory_portal_factories`
  );
  const byId = new Map<string, FactoryRecord>();
  for (const row of result.rows) {
    const record = row as Record<string, unknown>;
    byId.set(String(record.id), {
      id: String(record.id),
      name: String(record.name ?? ""),
      match: String(record.match_key ?? ""),
      accessToken: String(record.access_token ?? ""),
    });
  }
  return FACTORIES.map((factory) => byId.get(factory.id)).filter((row): row is FactoryRecord => !!row);
}

export async function factoryByToken(token: string): Promise<FactoryRecord | null> {
  if (!/^[a-f0-9]{32,64}$/i.test(token)) return null;
  const factories = await listFactories();
  return factories.find((factory) => factory.accessToken === token) ?? null;
}

export function staffTokenMatches(token: string): boolean {
  const expected = process.env.FACTORY_PORTAL_STAFF_TOKEN ?? "";
  if (!expected || expected === "change-me" || !token) return false;
  const left = Buffer.from(token);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function portalBaseUrl(): string {
  const configured = process.env.FACTORY_PORTAL_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3001";
}

export function factoryUrl(accessToken: string): string {
  return `${portalBaseUrl()}/f/${accessToken}`;
}
