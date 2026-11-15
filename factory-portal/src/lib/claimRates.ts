import { getDb } from "./db";
import { FACTORIES, matchFactoryId } from "./factories";

export type ClaimRateCase = {
  taskId: string;
  taskNumber: string;
  openedOn: string | null;
  serial: string;
};

export type ClaimRateLine = {
  sku: string;
  productName: string;
  quantity: number;
  claims: number;
  claimRatePct: number | null;
  cases: ClaimRateCase[];
};

export type ClaimRatePo = {
  poId: number;
  poNumber: string;
  poDate: string | null;
  quantity: number;
  claims: number;
  claimRatePct: number | null;
  lines: ClaimRateLine[];
};

export type FactoryClaimRates = {
  quantity: number;
  claims: number;
  claimRatePct: number | null;
  pos: ClaimRatePo[];
};

function rate(claims: number, quantity: number): number | null {
  if (quantity <= 0) return null;
  return Math.round((claims * 10000) / quantity) / 100;
}

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

export async function listFactoryClaimRates(factoryId: string): Promise<FactoryClaimRates> {
  const factory = FACTORIES.find((item) => item.id === factoryId);
  if (!factory) return { quantity: 0, claims: 0, claimRatePct: null, pos: [] };
  const days = daysExpr();
  const result = await getDb().execute({
    sql: `
      SELECT
        p.id AS po_id,
        COALESCE(NULLIF(NULLIF(TRIM(p.reference), ''), '-'), p.po_number) AS po_number,
        p.po_date,
        p.supplier_name,
        l.sku,
        l.product_name,
        l.quantity,
        COALESCE(m.matched_cases, 0) AS matched_cases
      FROM (
        SELECT po_id, sku,
               MAX(product_name) AS product_name,
               SUM(quantity) AS quantity
        FROM purchase_order_lines
        GROUP BY po_id, sku
      ) l
      JOIN purchase_orders p ON p.id = l.po_id
      LEFT JOIN (
        SELECT m.po_id, m.sku, COUNT(*) AS matched_cases
        FROM po_case_matches m
        JOIN tasks t ON t.id = m.task_id
        LEFT JOIN task_details td ON td.task_id = m.task_id
        WHERE m.match_tier != 'gray'
          AND m.po_id IS NOT NULL
          AND t.status != 'VOIDED'
          AND m.task_type = 'claim'
          AND ${days} IS NOT NULL
          AND ${days} <= 365
        GROUP BY m.po_id, m.sku
      ) m ON m.po_id = l.po_id AND m.sku = l.sku
      WHERE p.is_foreign = 1
        AND p.is_foc = 0
        AND l.sku IS NOT NULL
        AND TRIM(l.sku) != ''
        AND UPPER(p.supplier_name) LIKE ?
      ORDER BY p.po_date DESC, po_number, l.sku
    `,
    args: [`%${factory.match.toUpperCase()}%`],
  });

  const grouped = new Map<number, ClaimRatePo>();
  for (const raw of result.rows) {
    const row = raw as Record<string, unknown>;
    if (matchFactoryId(row.supplier_name != null ? String(row.supplier_name) : null) !== factoryId) continue;
    const poId = Number(row.po_id);
    const quantity = Number(row.quantity ?? 0);
    const claims = Number(row.matched_cases ?? 0);
    const line: ClaimRateLine = {
      sku: String(row.sku ?? ""),
      productName: String(row.product_name ?? "").trim() || String(row.sku ?? ""),
      quantity,
      claims,
      claimRatePct: rate(claims, quantity),
      cases: [],
    };
    const existing = grouped.get(poId);
    if (existing) {
      existing.lines.push(line);
    } else {
      grouped.set(poId, {
        poId,
        poNumber: String(row.po_number ?? ""),
        poDate: row.po_date != null ? String(row.po_date).slice(0, 10) : null,
        quantity: 0,
        claims: 0,
        claimRatePct: null,
        lines: [line],
      });
    }
  }

  const pos = [...grouped.values()].map((po) => {
    const quantity = po.lines.reduce((sum, line) => sum + line.quantity, 0);
    const claims = po.lines.reduce((sum, line) => sum + line.claims, 0);
    po.lines.sort((a, b) => (b.claimRatePct ?? -1) - (a.claimRatePct ?? -1) || b.claims - a.claims);
    return { ...po, quantity, claims, claimRatePct: rate(claims, quantity) };
  });
  pos.sort((a, b) => (b.claimRatePct ?? -1) - (a.claimRatePct ?? -1) || (b.poDate ?? "").localeCompare(a.poDate ?? ""));

  const caseResult = await getDb().execute({
    sql: `
      SELECT
        m.po_id,
        m.sku,
        m.task_id,
        m.task_number,
        p.supplier_name,
        date(datetime(t.timestamp / 1000, 'unixepoch', '+7 hours')) AS opened_on,
        td.product_serial AS serial
      FROM po_case_matches m
      JOIN tasks t ON t.id = m.task_id
      JOIN purchase_orders p ON p.id = m.po_id
      LEFT JOIN task_details td ON td.task_id = m.task_id
      WHERE m.match_tier != 'gray'
        AND m.po_id IS NOT NULL
        AND t.status != 'VOIDED'
        AND m.task_type = 'claim'
        AND ${days} IS NOT NULL
        AND ${days} <= 365
        AND p.is_foreign = 1
        AND p.is_foc = 0
        AND UPPER(p.supplier_name) LIKE ?
      ORDER BY opened_on DESC, m.task_number
    `,
    args: [`%${factory.match.toUpperCase()}%`],
  });
  for (const raw of caseResult.rows) {
    const row = raw as Record<string, unknown>;
    if (matchFactoryId(row.supplier_name != null ? String(row.supplier_name) : null) !== factoryId) continue;
    const po = grouped.get(Number(row.po_id));
    const line = po?.lines.find((item) => item.sku === String(row.sku ?? ""));
    if (!line) continue;
    const taskId = String(row.task_id ?? "");
    if (line.cases.some((item) => item.taskId === taskId)) continue;
    line.cases.push({
      taskId,
      taskNumber: String(row.task_number ?? ""),
      openedOn: row.opened_on != null ? String(row.opened_on) : null,
      serial: row.serial != null ? String(row.serial).trim() : "",
    });
  }

  const quantity = pos.reduce((sum, po) => sum + po.quantity, 0);
  const claims = pos.reduce((sum, po) => sum + po.claims, 0);
  return { quantity, claims, claimRatePct: rate(claims, quantity), pos };
}
