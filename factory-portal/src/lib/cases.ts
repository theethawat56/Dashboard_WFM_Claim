import { getDb } from "./db";
import { thisYearRange } from "./bangkok";
import { type CaseStatus, type CompType } from "./compensation";
import { ensurePortal, listFactories, matchFactoryId, type FactoryRecord } from "./factories";

export type { CaseStatus, CompType };

export type PortalCase = {
  id: string;
  taskNumber: string;
  sku: string;
  model: string;
  serial: string;
  symptomOriginal: string;
  openedOn: string | null;
  daysInWarranty: number | null;
  factoryId: string;
  status: CaseStatus;
  compType: string | null;
  amount: number | null;
  note: string | null;
  reason: string | null;
  replacementCost: number | null;
};

const WARRANTY_DAYS = 365;

type DecisionRow = {
  decision: string;
  compType: string | null;
  amount: number | null;
  note: string | null;
  reason: string | null;
  status: string;
};

function daysExpr(): string {
  return `CASE
    WHEN td.warranty_start_date IS NOT NULL AND TRIM(td.warranty_start_date) != ''
    THEN CAST(
      julianday(date(datetime(t.timestamp / 1000, 'unixepoch', '+7 hours')))
      - julianday(date(substr(td.warranty_start_date, 1, 10), '-14 days'))
    AS INTEGER)
    WHEN td.days_to_repair IS NOT NULL
    THEN td.days_to_repair + 14
    ELSE NULL
  END`;
}

function symptomExpr(): string {
  return `CASE
    WHEN TRIM(COALESCE(td.issue_group, '')) != ''
      AND TRIM(COALESCE(td.issue_description, '')) != ''
      AND TRIM(td.issue_group) != TRIM(td.issue_description)
    THEN TRIM(td.issue_group) || ' — ' || TRIM(td.issue_description)
    WHEN TRIM(COALESCE(td.issue_group, '')) != '' THEN TRIM(td.issue_group)
    ELSE TRIM(COALESCE(td.issue_description, ''))
  END`;
}

function asStatus(decision: DecisionRow | undefined): CaseStatus {
  if (!decision) return "waiting";
  if (decision.status === "confirmed") return "confirmed";
  if (decision.status === "returned") return "returned";
  if (decision.status === "rejected" || decision.decision === "rejected") return "rejected";
  return "proposed";
}

type SkuChoice = { status: string; factoryId: string | null };

async function loadSkuChoices(): Promise<Map<string, SkuChoice>> {
  await getDb().execute(`
    CREATE TABLE IF NOT EXISTS sku_factory_map (
      sku TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      factory_id TEXT,
      reason TEXT,
      updated_at TEXT
    )
  `);
  const result = await getDb().execute(`SELECT sku, status, factory_id FROM sku_factory_map`);
  const map = new Map<string, SkuChoice>();
  for (const raw of result.rows) {
    const row = raw as Record<string, unknown>;
    map.set(String(row.sku ?? "").trim(), {
      status: String(row.status ?? ""),
      factoryId: row.factory_id != null ? String(row.factory_id) : null,
    });
  }
  return map;
}

function assignFactory(
  row: Record<string, unknown>,
  skuChoices: Map<string, SkuChoice>,
  factories: FactoryRecord[]
): string | null {
  const sku = row.sku != null ? String(row.sku).trim() : "";
  const choice = skuChoices.get(sku);
  if (choice?.status === "excluded") return null;
  if (choice?.status === "confirmed" && choice.factoryId) return choice.factoryId;
  const supplier = row.supplier_name != null ? String(row.supplier_name) : "";
  const known = matchFactoryId(supplier);
  if (known) return known;
  const upper = supplier.trim().toUpperCase();
  if (!upper) return null;
  const hit = factories.find(
    (factory) => factory.name.trim().toUpperCase() === upper || factory.match.trim().toUpperCase() === upper
  );
  return hit?.id ?? null;
}

async function latestPoCosts(): Promise<Map<string, number>> {
  const result = await getDb().execute(`
    SELECT sku, unit_cost FROM (
      SELECT l.sku AS sku, l.unit_cost AS unit_cost,
             ROW_NUMBER() OVER (PARTITION BY l.sku ORDER BY p.po_date DESC, p.id DESC) AS rn
      FROM purchase_order_lines l
      JOIN purchase_orders p ON p.id = l.po_id
      WHERE l.unit_cost IS NOT NULL AND l.unit_cost > 0 AND l.sku IS NOT NULL
    )
    WHERE rn = 1
  `);
  const costs = new Map<string, number>();
  for (const raw of result.rows) {
    const row = raw as Record<string, unknown>;
    costs.set(String(row.sku ?? "").trim(), Number(row.unit_cost ?? 0));
  }
  return costs;
}

function mapTask(
  row: Record<string, unknown>,
  decision: DecisionRow | undefined,
  skuChoices: Map<string, SkuChoice>,
  factories: FactoryRecord[],
  costs: Map<string, number>,
  forcedFactoryId?: string
): PortalCase | null {
  const factoryId = forcedFactoryId ?? assignFactory(row, skuChoices, factories);
  if (!factoryId) return null;
  const days = row.days_from_register != null ? Number(row.days_from_register) : null;
  const sku = row.sku != null ? String(row.sku).trim() : "";
  return {
    id: String(row.id ?? ""),
    taskNumber: String(row.task_number ?? ""),
    sku,
    model: row.product_model != null ? String(row.product_model).trim() : "",
    serial: row.product_serial != null ? String(row.product_serial).trim() : "",
    symptomOriginal: row.symptom != null ? String(row.symptom).trim() : "",
    openedOn: row.opened_on != null ? String(row.opened_on) : null,
    daysInWarranty: Number.isFinite(days as number) ? days : null,
    factoryId,
    status: asStatus(decision),
    compType: decision?.compType ?? null,
    amount: decision?.amount ?? null,
    note: decision?.note ?? null,
    reason: decision?.reason ?? null,
    replacementCost: costs.get(sku) ?? null,
  };
}

async function decisionMap(): Promise<Map<string, DecisionRow>> {
  const result = await getDb().execute(
    `SELECT task_id, decision, comp_type, amount, note, reason, status FROM factory_portal_decisions`
  );
  const map = new Map<string, DecisionRow>();
  for (const row of result.rows) {
    const record = row as Record<string, unknown>;
    map.set(String(record.task_id), {
      decision: String(record.decision ?? ""),
      compType: record.comp_type != null ? String(record.comp_type) : null,
      amount: record.amount != null ? Number(record.amount) : null,
      note: record.note != null ? String(record.note) : null,
      reason: record.reason != null ? String(record.reason) : null,
      status: String(record.status ?? ""),
    });
  }
  return map;
}

async function selectOpenCases(): Promise<PortalCase[]> {
  await ensurePortal();
  const db = getDb();
  const year = thisYearRange();
  const days = daysExpr();
  const opened = `date(datetime(t.timestamp / 1000, 'unixepoch', '+7 hours'))`;
  const result = await db.execute({
    sql: `
      SELECT
        t.id,
        t.task_number,
        td.sku,
        td.product_model,
        td.product_serial,
        m.supplier_name,
        ${symptomExpr()} AS symptom,
        ${opened} AS opened_on,
        ${days} AS days_from_register
      FROM tasks t
      JOIN task_details td ON td.task_id = t.id
      LEFT JOIN po_case_matches m ON m.task_id = t.id
      LEFT JOIN (
        SELECT task_id FROM claim_comp_batch_tasks GROUP BY task_id
      ) bt ON bt.task_id = t.id
      WHERE t.status != 'VOIDED'
        AND bt.task_id IS NULL
        AND ${opened} >= ?
        AND ${opened} <= ?
        AND ${days} IS NOT NULL
        AND ${days} <= ${WARRANTY_DAYS}
        AND LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(COALESCE(td.product_serial, ''))), '-', ''), ' ', ''), '.', ''), '/', '')) >= 5
        AND NOT (
          TRIM(COALESCE(td.issue_group, '')) = ''
          AND TRIM(COALESCE(td.issue_description, '')) = ''
        )
      ORDER BY ${days} DESC, t.task_number ASC
    `,
    args: [year.from, year.to],
  });
  const [decisions, skuChoices, factories, costs] = await Promise.all([
    decisionMap(),
    loadSkuChoices(),
    listFactories(),
    latestPoCosts(),
  ]);
  const cases: PortalCase[] = [];
  for (const row of result.rows) {
    const mapped = mapTask(
      row as Record<string, unknown>,
      decisions.get(String((row as Record<string, unknown>).id)),
      skuChoices,
      factories,
      costs
    );
    if (mapped) cases.push(mapped);
  }
  return cases;
}

async function selectConfirmed(factoryId: string): Promise<PortalCase[]> {
  await ensurePortal();
  const year = thisYearRange();
  const opened = `date(datetime(t.timestamp / 1000, 'unixepoch', '+7 hours'))`;
  const result = await getDb().execute({
    sql: `
      SELECT
        t.id,
        t.task_number,
        td.sku,
        td.product_model,
        td.product_serial,
        m.supplier_name,
        ${symptomExpr()} AS symptom,
        ${opened} AS opened_on,
        ${daysExpr()} AS days_from_register,
        d.decision,
        d.comp_type,
        d.amount,
        d.note,
        d.reason,
        d.status
      FROM factory_portal_decisions d
      JOIN tasks t ON t.id = d.task_id
      JOIN task_details td ON td.task_id = t.id
      LEFT JOIN po_case_matches m ON m.task_id = t.id
      WHERE d.factory_id = ?
        AND d.status = 'confirmed'
        AND ${opened} >= ?
        AND ${opened} <= ?
      ORDER BY d.updated_at DESC
    `,
    args: [factoryId, year.from, year.to],
  });
  const [skuChoices, factories, costs] = await Promise.all([loadSkuChoices(), listFactories(), latestPoCosts()]);
  return (result.rows as Record<string, unknown>[]).map((row) => {
    const decision: DecisionRow = {
      decision: String(row.decision ?? ""),
      compType: row.comp_type != null ? String(row.comp_type) : null,
      amount: row.amount != null ? Number(row.amount) : null,
      note: row.note != null ? String(row.note) : null,
      reason: row.reason != null ? String(row.reason) : null,
      status: "confirmed",
    };
    const sku = row.sku != null ? String(row.sku).trim() : "";
    return (
      mapTask(row, decision, skuChoices, factories, costs, factoryId) ?? {
        id: String(row.id ?? ""),
        taskNumber: String(row.task_number ?? ""),
        sku,
        model: row.product_model != null ? String(row.product_model).trim() : "",
        serial: row.product_serial != null ? String(row.product_serial).trim() : "",
        symptomOriginal: row.symptom != null ? String(row.symptom).trim() : "",
        openedOn: row.opened_on != null ? String(row.opened_on) : null,
        daysInWarranty: row.days_from_register != null ? Number(row.days_from_register) : null,
        factoryId,
        status: "confirmed" as const,
        compType: decision.compType,
        amount: decision.amount,
        note: decision.note,
        reason: decision.reason,
        replacementCost: costs.get(sku) ?? null,
      }
    );
  });
}

export async function replacementPoCost(sku: string): Promise<number | null> {
  const cost = (await latestPoCosts()).get(sku.trim());
  return cost != null && cost > 0 ? cost : null;
}

export async function listOpenCases(): Promise<PortalCase[]> {
  return selectOpenCases();
}

export async function listFactoryCases(factoryId: string): Promise<PortalCase[]> {
  const open = (await selectOpenCases()).filter((row) => row.factoryId === factoryId);
  const confirmed = await selectConfirmed(factoryId);
  const seen = new Set(open.map((row) => row.id));
  return [...open, ...confirmed.filter((row) => !seen.has(row.id))];
}

export async function submitDecision(input: {
  factoryId: string;
  taskId: string;
  decision: "approved" | "rejected";
  compType: CompType | null;
  amount: number | null;
  note: string | null;
  reason: string | null;
}): Promise<{ ok: true; taskNumber: string } | { ok: false; error: string }> {
  const cases = await listOpenCases();
  const current = cases.find((row) => row.id === input.taskId && row.factoryId === input.factoryId);
  if (!current) return { ok: false, error: "This case is not open for a decision." };
  if (current.status === "proposed" || current.status === "rejected" || current.status === "confirmed") {
    return { ok: false, error: "This case was already submitted and is waiting for review." };
  }
  const now = new Date().toISOString();
  const status = input.decision === "approved" ? "proposed" : "rejected";
  await getDb().execute({
    sql: `INSERT INTO factory_portal_decisions (
            task_id, factory_id, task_number, sku, decision, comp_type, amount, note, reason, status, submitted_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(task_id) DO UPDATE SET
            factory_id = excluded.factory_id,
            task_number = excluded.task_number,
            sku = excluded.sku,
            decision = excluded.decision,
            comp_type = excluded.comp_type,
            amount = excluded.amount,
            note = excluded.note,
            reason = excluded.reason,
            status = excluded.status,
            submitted_at = excluded.submitted_at,
            updated_at = excluded.updated_at`,
    args: [
      current.id,
      input.factoryId,
      current.taskNumber,
      current.sku || null,
      input.decision,
      input.compType,
      input.amount,
      input.note,
      input.reason,
      status,
      now,
      now,
    ],
  });
  return { ok: true, taskNumber: current.taskNumber };
}
