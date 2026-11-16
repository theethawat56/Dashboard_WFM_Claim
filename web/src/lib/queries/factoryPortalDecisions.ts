import { randomBytes } from "crypto";
import { getDb } from "../db";
import { bangkokDate } from "../bangkokDate";
import { sqlDaysToRepairExpr } from "../warrantyBuffer";
import { ensureClaimCompTables, insertBatch } from "./claimCompensations";
import type { CompType } from "@/types/dashboard";

/** First day a factory could open its claim link. */
const VISIBLE_FROM = "2026-11-13";

/** Keep this list in sync with factory-portal/src/lib/factories.ts */
const FACTORIES: { id: string; name: string; match: string }[] = [
  { id: "midea", name: "MIDEA ELECTRIC TRADING (SINGAPORE) CO. PTE. LTD.", match: "MIDEA" },
  { id: "jonr", name: "SUZHOU JONR TECHNOLOGY CO., LTD", match: "JONR" },
  { id: "welland", name: "Guangdong Welland Technology Co., Ltd", match: "WELLAND" },
  { id: "genhigh", name: "GENHIGH TECH CO.,LTD", match: "GENHIGH" },
  { id: "stc", name: "STC CORPORATION LIMITED", match: "STC CORPORATION" },
  { id: "hizero", name: "HIZERO HK LIMITED", match: "HIZERO" },
];

function matchFactoryId(supplierName: string | null | undefined): string | null {
  const upper = (supplierName ?? "").toUpperCase();
  if (!upper.trim()) return null;
  for (const factory of FACTORIES) {
    if (upper.includes(factory.match)) return factory.id;
  }
  return null;
}

function visibleOn(opened: string): string {
  return opened > VISIBLE_FROM ? opened : VISIBLE_FROM;
}

const VALID_TYPES: CompType[] = ["cost_refund", "spare_parts", "deduce", "replacement"];

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
];

export type FactoryPortalPending = {
  taskId: string;
  taskNumber: string;
  factoryName: string;
  sku: string;
  decision: string;
  compType: string | null;
  amount: number | null;
  note: string | null;
  reason: string | null;
  status: string;
  submittedAt: string | null;
};

export type FactoryPortalLink = {
  id: string;
  name: string;
  url: string;
};

let ready = false;

async function ensureFactoryPortal(): Promise<void> {
  if (ready) return;
  const db = getDb();
  for (const sql of SCHEMA) await db.execute(sql);
  for (const factory of FACTORIES) {
    await db.execute({
      sql: `INSERT INTO factory_portal_factories (id, name, match_key, access_token)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, match_key = excluded.match_key`,
      args: [factory.id, factory.name, factory.match, randomBytes(24).toString("hex")],
    });
  }
  ready = true;
}

function portalBase(): string {
  return (process.env.FACTORY_PORTAL_PUBLIC_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

export async function listFactoryPortalHome(): Promise<{
  pending: FactoryPortalPending[];
  links: FactoryPortalLink[];
}> {
  await ensureFactoryPortal();
  const db = getDb();
  const pendingResult = await db.execute(`
    SELECT d.task_id, d.task_number, d.sku, d.decision, d.comp_type, d.amount, d.note, d.reason,
           d.status, d.submitted_at, f.name AS factory_name
    FROM factory_portal_decisions d
    JOIN factory_portal_factories f ON f.id = d.factory_id
    WHERE d.status IN ('proposed', 'rejected')
    ORDER BY d.submitted_at DESC
  `);
  const linkResult = await db.execute(
    `SELECT id, name, access_token FROM factory_portal_factories`
  );
  const tokens = new Map<string, string>();
  for (const row of linkResult.rows) {
    const record = row as Record<string, unknown>;
    tokens.set(String(record.id), String(record.access_token ?? ""));
  }

  return {
    pending: (pendingResult.rows as Record<string, unknown>[]).map((row) => ({
      taskId: String(row.task_id ?? ""),
      taskNumber: String(row.task_number ?? ""),
      factoryName: String(row.factory_name ?? ""),
      sku: row.sku != null ? String(row.sku) : "",
      decision: String(row.decision ?? ""),
      compType: row.comp_type != null ? String(row.comp_type) : null,
      amount: row.amount != null ? Number(row.amount) : null,
      note: row.note != null ? String(row.note) : null,
      reason: row.reason != null ? String(row.reason) : null,
      status: String(row.status ?? ""),
      submittedAt: row.submitted_at != null ? String(row.submitted_at) : null,
    })),
    links: FACTORIES.map((factory) => ({
      id: factory.id,
      name: factory.name,
      url: `${portalBase()}/f/${tokens.get(factory.id) ?? ""}`,
    })),
  };
}

export async function confirmFactoryDecision(taskId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureFactoryPortal();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT d.task_id, d.task_number, d.factory_id, d.sku, d.decision, d.comp_type, d.amount, d.note, d.status,
                 td.sku AS task_sku, f.name AS factory_name
          FROM factory_portal_decisions d
          LEFT JOIN task_details td ON td.task_id = d.task_id
          LEFT JOIN factory_portal_factories f ON f.id = d.factory_id
          WHERE d.task_id = ?`,
    args: [taskId],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return { ok: false, error: "ไม่พบคำตอบจากโรงงาน" };
  if (String(row.status) === "confirmed") return { ok: true };
  if (String(row.status) !== "proposed" || String(row.decision) !== "approved") {
    return { ok: false, error: "ยืนยันได้เฉพาะเคสที่โรงงานเสนอชดเชยแล้ว" };
  }
  const compType = String(row.comp_type ?? "");
  if (!VALID_TYPES.includes(compType as CompType)) {
    return { ok: false, error: "ประเภทชดเชยไม่ถูกต้อง" };
  }
  const sku = String(row.task_sku ?? row.sku ?? "").trim();
  if (!sku) return { ok: false, error: "งานนี้ไม่มี SKU จึงบันทึกผลเคลมไม่ได้" };

  await ensureClaimCompTables();
  const existing = await db.execute({
    sql: `SELECT task_id FROM claim_comp_batch_tasks WHERE task_id = ?`,
    args: [taskId],
  });
  if (existing.rows.length === 0) {
    const factoryName = String(row.factory_name ?? "").trim();
    const note = [factoryName, row.note != null ? String(row.note).trim() : ""].filter(Boolean).join(" — ");
    await insertBatch({
      sku,
      comp_type: compType as CompType,
      amount: Number(row.amount ?? 0),
      note: note || null,
      tasks: [{ task_id: taskId, task_number: String(row.task_number ?? "") }],
    });
  }
  await db.execute({
    sql: `UPDATE factory_portal_decisions SET status = 'confirmed', updated_at = ? WHERE task_id = ?`,
    args: [new Date().toISOString(), taskId],
  });
  return { ok: true };
}

export async function returnFactoryDecision(taskId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureFactoryPortal();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT status FROM factory_portal_decisions WHERE task_id = ?`,
    args: [taskId],
  });
  const status = result.rows[0] ? String((result.rows[0] as Record<string, unknown>).status ?? "") : "";
  if (!status) return { ok: false, error: "ไม่พบคำตอบจากโรงงาน" };
  if (status !== "proposed" && status !== "rejected") {
    return { ok: false, error: "ตีกลับได้เฉพาะเคสที่รอทีมตรวจ" };
  }
  await db.execute({
    sql: `UPDATE factory_portal_decisions SET status = 'returned', updated_at = ? WHERE task_id = ?`,
    args: [new Date().toISOString(), taskId],
  });
  return { ok: true };
}

export type FactoryOutcomeRow = {
  taskId: string;
  taskNumber: string;
  factoryId: string;
  factoryName: string;
  decision: "approved" | "rejected";
  compType: string | null;
  amount: number | null;
  note: string | null;
  reason: string | null;
  status: string;
  submittedAt: string;
  daysToReply: number | null;
};

export type FactoryWeekPoint = {
  weekStart: string;
  label: string;
  byFactory: Record<string, { medianDays: number | null; count: number }>;
};

export type FactoryPortalInsights = {
  replies: number;
  approved: number;
  rejected: number;
  medianDays: number | null;
  latestMedianDays: number | null;
  previousMedianDays: number | null;
  factories: {
    id: string;
    name: string;
    shortName: string;
    approved: number;
    rejected: number;
    byType: Record<string, number>;
    medianDays: number | null;
    waitingCount: number;
    medianWaitDays: number | null;
    oldestWaitDays: number | null;
  }[];
  weeks: FactoryWeekPoint[];
  approvals: FactoryOutcomeRow[];
  rejections: FactoryOutcomeRow[];
};

const SHORT_NAME: Record<string, string> = {
  midea: "MIDEA",
  jonr: "JONR",
  welland: "WELLAND",
  genhigh: "GENHIGH",
  stc: "STC",
  hizero: "HIZERO",
};

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function bangkokYmd(value: string | number): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts;
}

function weekStart(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const shift = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + shift);
  return date.toISOString().slice(0, 10);
}

function weekLabel(ymd: string): string {
  const [, month, day] = ymd.split("-").map(Number);
  return `${day} ${THAI_MONTHS[month - 1]}`;
}

function daysBetween(opened: string, submitted: string): number {
  const [ay, am, ad] = opened.split("-").map(Number);
  const [by, bm, bd] = submitted.split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function listWaitingByFactory(): Promise<Map<string, number[]>> {
  const today = bangkokDate();
  const yearFrom = `${today.slice(0, 4)}-01-01`;
  const opened = `date(datetime(t.timestamp / 1000, 'unixepoch', '+7 hours'))`;
  const days = sqlDaysToRepairExpr();
  const result = await getDb().execute({
    sql: `
      SELECT m.supplier_name, ${opened} AS opened_on
      FROM tasks t
      JOIN task_details td ON td.task_id = t.id
      JOIN po_case_matches m ON m.task_id = t.id
      LEFT JOIN (
        SELECT task_id FROM claim_comp_batch_tasks GROUP BY task_id
      ) bt ON bt.task_id = t.id
      LEFT JOIN factory_portal_decisions d ON d.task_id = t.id
      WHERE t.status != 'VOIDED'
        AND bt.task_id IS NULL
        AND ${opened} >= ?
        AND ${opened} <= ?
        AND ${days} IS NOT NULL
        AND ${days} <= 365
        AND LOWER(TRIM(COALESCE(td.product_serial, ''))) NOT IN ('', '-', 'n/a', 'none', 'null')
        AND NOT (
          TRIM(COALESCE(td.issue_group, '')) = ''
          AND TRIM(COALESCE(td.issue_description, '')) = ''
        )
        AND (d.task_id IS NULL OR d.status = 'waiting')
    `,
    args: [yearFrom, today],
  });
  const byFactory = new Map<string, number[]>();
  for (const raw of result.rows) {
    const record = raw as Record<string, unknown>;
    const factoryId = matchFactoryId(record.supplier_name != null ? String(record.supplier_name) : null);
    const openedOn = record.opened_on != null ? String(record.opened_on) : "";
    if (!factoryId || !openedOn) continue;
    const waits = byFactory.get(factoryId) ?? [];
    waits.push(daysBetween(visibleOn(openedOn), today));
    byFactory.set(factoryId, waits);
  }
  return byFactory;
}

export async function listFactoryPortalInsights(): Promise<FactoryPortalInsights> {
  await ensureFactoryPortal();
  const db = getDb();
  const result = await db.execute(`
    SELECT d.task_id, d.task_number, d.factory_id, f.name AS factory_name, d.decision, d.comp_type,
           d.amount, d.note, d.reason, d.status, d.submitted_at, t.timestamp
    FROM factory_portal_decisions d
    JOIN factory_portal_factories f ON f.id = d.factory_id
    LEFT JOIN tasks t ON t.id = d.task_id
    WHERE d.submitted_at IS NOT NULL
      AND d.status IN ('proposed', 'rejected', 'confirmed', 'returned')
    ORDER BY d.submitted_at DESC
  `);

  const rows: FactoryOutcomeRow[] = [];
  for (const raw of result.rows) {
    const record = raw as Record<string, unknown>;
    const submittedAt = String(record.submitted_at ?? "");
    const submittedYmd = bangkokYmd(submittedAt);
    if (!submittedYmd) continue;
    const decision = String(record.decision ?? "") === "rejected" ? "rejected" : "approved";
    const opened = record.timestamp != null ? bangkokYmd(Number(record.timestamp)) : null;
    const visible = opened ? visibleOn(opened) : null;
    rows.push({
      taskId: String(record.task_id ?? ""),
      taskNumber: String(record.task_number ?? ""),
      factoryId: String(record.factory_id ?? ""),
      factoryName: String(record.factory_name ?? ""),
      decision,
      compType: record.comp_type != null ? String(record.comp_type) : null,
      amount: record.amount != null ? Number(record.amount) : null,
      note: record.note != null ? String(record.note) : null,
      reason: record.reason != null ? String(record.reason) : null,
      status: String(record.status ?? ""),
      submittedAt,
      daysToReply: visible ? daysBetween(visible, submittedYmd) : null,
    });
  }

  const waiting = await listWaitingByFactory();
  const factories = FACTORIES.map((factory) => {
    const mine = rows.filter((row) => row.factoryId === factory.id);
    const pending = waiting.get(factory.id) ?? [];
    const byType: Record<string, number> = { cost_refund: 0, spare_parts: 0, deduce: 0, replacement: 0 };
    for (const row of mine) {
      if (row.decision === "approved" && row.compType && byType[row.compType] != null) byType[row.compType] += 1;
    }
    return {
      id: factory.id,
      name: factory.name,
      shortName: SHORT_NAME[factory.id] ?? factory.name,
      approved: mine.filter((row) => row.decision === "approved").length,
      rejected: mine.filter((row) => row.decision === "rejected").length,
      byType,
      medianDays: median(mine.flatMap((row) => (row.daysToReply == null ? [] : [row.daysToReply]))),
      waitingCount: pending.length,
      medianWaitDays: median(pending),
      oldestWaitDays: pending.length > 0 ? Math.max(...pending) : null,
    };
  });

  const weekKeys = new Map<string, Map<string, number[]>>();
  for (const row of rows) {
    if (row.daysToReply == null) continue;
    const start = weekStart(bangkokYmd(row.submittedAt) ?? "");
    if (!weekKeys.has(start)) weekKeys.set(start, new Map());
    const bucket = weekKeys.get(start);
    if (!bucket) continue;
    const list = bucket.get(row.factoryId) ?? [];
    list.push(row.daysToReply);
    bucket.set(row.factoryId, list);
  }

  const starts = [...weekKeys.keys()].sort();
  const filled: string[] = [];
  if (starts.length > 0) {
    for (let cursor = starts[0]; cursor <= starts[starts.length - 1]; cursor = addDays(cursor, 7)) {
      filled.push(cursor);
    }
  }

  const weeks: FactoryWeekPoint[] = filled.map((start) => {
    const bucket = weekKeys.get(start) ?? new Map<string, number[]>();
    const byFactory: FactoryWeekPoint["byFactory"] = {};
    for (const factory of FACTORIES) {
      const values = bucket.get(factory.id) ?? [];
      byFactory[factory.id] = { medianDays: median(values), count: values.length };
    }
    return { weekStart: start, label: weekLabel(start), byFactory };
  });

  const timed = rows.flatMap((row) => (row.daysToReply == null ? [] : [row.daysToReply]));
  const latest = weeks.length > 0 ? weeks[weeks.length - 1] : null;
  const previous = weeks.length > 1 ? weeks[weeks.length - 2] : null;
  const weekMedian = (point: FactoryWeekPoint | null): number | null => {
    if (!point) return null;
    const values = rows.flatMap((row) => {
      if (row.daysToReply == null) return [];
      const start = weekStart(bangkokYmd(row.submittedAt) ?? "");
      return start === point.weekStart ? [row.daysToReply] : [];
    });
    return median(values);
  };

  return {
    replies: rows.length,
    approved: rows.filter((row) => row.decision === "approved").length,
    rejected: rows.filter((row) => row.decision === "rejected").length,
    medianDays: median(timed),
    latestMedianDays: weekMedian(latest),
    previousMedianDays: weekMedian(previous),
    factories,
    weeks,
    approvals: rows.filter((row) => row.decision === "approved"),
    rejections: rows.filter((row) => row.decision === "rejected"),
  };
}
