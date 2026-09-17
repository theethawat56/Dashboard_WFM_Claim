import { getDb } from "../db";
import { ensureNewColumns } from "../migrate";
import { resolveFactorySkus, skuInSql } from "../factoryClaimSkus";
import { ensureClaimCompTables } from "./claimCompensations";
import { SQL_NOT_VOIDED } from "../taskStatus";
import { sqlDaysToRepairExpr } from "../warrantyBuffer";
import type {
  FactoryClaimKpis,
  FactoryMatchRow,
  FactoryPoHeaderRow,
  FactoryPoSkuRow,
  PoMatchTier,
} from "@/types/dashboard";

const WARRANTY_DAYS = 365;

export type FactoryDateField = "po" | "repair";

export interface FactoryClaimFilters {
  skus?: string[] | null;
  from?: string;
  to?: string;
  dateField?: FactoryDateField;
}

async function ensure(): Promise<void> {
  await ensureNewColumns();
}

function bangkokYear(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).format(new Date());
}

function ymd(value?: string | null): string | undefined {
  const m = (value ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : undefined;
}

/** Same as claim tracking: recompute from the displayed (buffered) warranty start. */
function daysToRepairExpr(): string {
  return sqlDaysToRepairExpr();
}

function inWarrantySql(): string {
  const d = `(${daysToRepairExpr()})`;
  return `${d} IS NOT NULL AND ${d} <= ${WARRANTY_DAYS}`;
}

function repairDateExpr(): string {
  return `date(datetime(t.timestamp / 1000, 'unixepoch', '+7 hours'))`;
}

function poDateExpr(alias: "m" | "p"): string {
  return `substr(${alias}.po_date, 1, 10)`;
}

function pushDateRange(
  where: string[],
  args: (string | number)[],
  column: string,
  from?: string,
  to?: string
): void {
  if (from) {
    where.push(`${column} >= ?`);
    args.push(from);
  }
  if (to) {
    where.push(`${column} <= ?`);
    args.push(to);
  }
}

function matchDateColumn(dateField: FactoryDateField): string {
  return dateField === "po" ? poDateExpr("m") : repairDateExpr();
}

function normalizeFilters(filters: FactoryClaimFilters = {}): {
  selected: string[];
  from?: string;
  to?: string;
  dateField: FactoryDateField;
} {
  return {
    selected: resolveFactorySkus(filters.skus),
    from: ymd(filters.from),
    to: ymd(filters.to),
    dateField: filters.dateField === "po" ? "po" : "repair",
  };
}

function matchFromSql(): string {
  return `
    FROM po_case_matches m
    JOIN tasks t ON t.id = m.task_id
    LEFT JOIN task_details td ON td.task_id = m.task_id
  `;
}

export async function getFactoryKpis(
  filters: FactoryClaimFilters = {}
): Promise<FactoryClaimKpis> {
  await ensure();
  await ensureClaimCompTables();
  const db = getDb();
  const year = bangkokYear();
  const { selected, from, to, dateField } = normalizeFilters(filters);
  const skuFilter = skuInSql("m.sku", selected);
  const lSkuFilter = skuInSql("l.sku", selected);
  const hasDateRange = Boolean(from || to);

  const poWhere = ["p.is_foreign = 1", lSkuFilter.sql];
  const poArgs: (string | number)[] = [...lSkuFilter.args];
  if (dateField === "po") {
    pushDateRange(poWhere, poArgs, poDateExpr("p"), from, to);
  }

  const po = await db.execute({
    sql: `SELECT COUNT(DISTINCT p.id) as c
          FROM purchase_orders p
          JOIN purchase_order_lines l ON l.po_id = p.id
          WHERE ${poWhere.join(" AND ")}`,
    args: poArgs,
  });
  const lines = await db.execute({
    sql: `SELECT COUNT(*) as c FROM purchase_order_lines l
     JOIN purchase_orders p ON p.id = l.po_id
     WHERE ${poWhere.join(" AND ")}`,
    args: poArgs,
  });

  const matchWhere = [SQL_NOT_VOIDED, skuFilter.sql, inWarrantySql()];
  const matchArgs: (string | number)[] = [...skuFilter.args];
  if (hasDateRange) {
    pushDateRange(matchWhere, matchArgs, matchDateColumn(dateField), from, to);
  }

  const tiers = await db.execute({
    sql: `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN match_tier != 'gray' THEN 1 ELSE 0 END) as matched,
      SUM(CASE WHEN match_tier = 'green' THEN 1 ELSE 0 END) as green,
      SUM(CASE WHEN match_tier = 'orange' THEN 1 ELSE 0 END) as orange,
      SUM(CASE WHEN match_tier = 'yellow' THEN 1 ELSE 0 END) as yellow,
      SUM(CASE WHEN match_tier = 'gray' THEN 1 ELSE 0 END) as gray
      ${matchFromSql()}
      WHERE ${matchWhere.join(" AND ")}
  `,
    args: matchArgs,
  });

  const damageWhere = [...matchWhere, "m.task_type = 'claim'"];
  const damageArgs: (string | number)[] = [...matchArgs];
  if (!hasDateRange) {
    damageWhere.push(`COALESCE(
      strftime('%Y', datetime(t.timestamp / 1000, 'unixepoch', '+7 hours')),
      substr(td.create_date, 1, 4),
      substr(m.ref_date, 1, 4)
    ) = ?`);
    damageArgs.push(year);
  }
  const damage = await db.execute({
    sql: `
      SELECT COALESCE(SUM(
        CASE WHEN m.match_tier != 'gray' THEN COALESCE(m.unit_cost, 0) ELSE 0 END
      ), 0) as damage_total
      ${matchFromSql()}
      WHERE ${damageWhere.join(" AND ")}
    `,
    args: damageArgs,
  });
  const recovered = await db.execute({
    sql: `
      SELECT COALESCE(SUM(b.amount), 0) as recovered_total
      FROM claim_comp_batches b
      WHERE b.id IN (
        SELECT DISTINCT bt.batch_id
        FROM claim_comp_batch_tasks bt
        JOIN po_case_matches m ON m.task_id = bt.task_id
        JOIN tasks t ON t.id = m.task_id
        LEFT JOIN task_details td ON td.task_id = m.task_id
        WHERE ${damageWhere.join(" AND ")}
          AND m.match_tier != 'gray'
      )
    `,
    args: damageArgs,
  });
  const sync = await db.execute(
    `SELECT finished_at FROM sync_log WHERE sync_type = 'purchase_orders' ORDER BY id DESC LIMIT 1`
  );
  const t = (tiers.rows[0] ?? {}) as Record<string, unknown>;
  const damageTotal = Number((damage.rows[0] as { damage_total?: number })?.damage_total ?? 0);
  const recoveredTotal = Number(
    (recovered.rows[0] as { recovered_total?: number })?.recovered_total ?? 0
  );
  const resultRes = await db.execute(
    `SELECT COALESCE(SUM(amount), 0) as result_total FROM claim_comp_batches`
  );
  const resultTotal = Number(
    (resultRes.rows[0] as { result_total?: number })?.result_total ?? 0
  );
  return {
    po_count: Number((po.rows[0] as { c?: number })?.c ?? 0),
    line_count: Number((lines.rows[0] as { c?: number })?.c ?? 0),
    case_total: Number(t.total ?? 0),
    matched: Number(t.matched ?? 0),
    green: Number(t.green ?? 0),
    orange: Number(t.orange ?? 0),
    yellow: Number(t.yellow ?? 0),
    gray: Number(t.gray ?? 0),
    damage_total: damageTotal,
    recovered_total: recoveredTotal,
    recovered_pct: damageTotal > 0 ? (recoveredTotal * 100) / damageTotal : null,
    result_total: resultTotal,
    remaining_total: damageTotal - resultTotal,
    damage_year: hasDateRange ? `${from ?? "…"}–${to ?? "…"}` : year,
    last_synced_at: ((sync.rows[0] as { finished_at?: string } | undefined)?.finished_at) ?? null,
  };
}

export async function getFactoryPoHeaders(
  filters: FactoryClaimFilters = {}
): Promise<FactoryPoHeaderRow[]> {
  await ensure();
  const db = getDb();
  const { selected, from, to, dateField } = normalizeFilters(filters);
  const lSku = skuInSql("l.sku", selected);
  const where = [
    "is_foreign = 1",
    `id IN (SELECT l.po_id FROM purchase_order_lines l WHERE ${lSku.sql})`,
  ];
  const args: (string | number)[] = [...lSku.args];
  if (dateField === "po") {
    pushDateRange(where, args, poDateExpr("p"), from, to);
  }
  const r = await db.execute({
    sql: `
    SELECT id, po_number, po_date, status, payment_status, supplier_name, supplier_code,
           reference, total_amount, total_quantity, payment_amount, currency, created_by, payment_term
    FROM purchase_orders p
    WHERE ${where.join(" AND ")}
    ORDER BY po_date DESC, id DESC
  `,
    args,
  });
  return (r.rows as Record<string, unknown>[]).map((row) => ({
    id: Number(row.id),
    po_number: String(row.po_number ?? ""),
    po_date: row.po_date != null ? String(row.po_date) : null,
    status: row.status != null ? String(row.status) : null,
    payment_status: row.payment_status != null ? String(row.payment_status) : null,
    supplier_name: String(row.supplier_name ?? ""),
    supplier_code: row.supplier_code != null ? String(row.supplier_code) : null,
    reference: row.reference != null ? String(row.reference) : null,
    total_amount: Number(row.total_amount ?? 0),
    total_quantity: Number(row.total_quantity ?? 0),
    payment_amount: Number(row.payment_amount ?? 0),
    currency: row.currency != null ? String(row.currency) : null,
    created_by: row.created_by != null ? String(row.created_by) : null,
    payment_term: row.payment_term != null ? String(row.payment_term) : null,
  }));
}

export async function getFactoryPoSkuSummary(
  filters: FactoryClaimFilters = {}
): Promise<FactoryPoSkuRow[]> {
  await ensure();
  const db = getDb();
  const year = bangkokYear();
  const { selected, from, to, dateField } = normalizeFilters(filters);
  const hasDateRange = Boolean(from || to);
  const lSku = skuInSql("l.sku", selected);
  const matchWhere = [
    "m.match_tier != 'gray'",
    "m.po_id IS NOT NULL",
    SQL_NOT_VOIDED,
    inWarrantySql(),
    "m.task_type = 'claim'",
  ];
  const matchArgs: (string | number)[] = [];
  const damageYearExpr = `COALESCE(
    strftime('%Y', datetime(t.timestamp / 1000, 'unixepoch', '+7 hours')),
    substr(td.create_date, 1, 4),
    substr(m.ref_date, 1, 4)
  )`;
  const damageSql = hasDateRange
    ? "COALESCE(m.unit_cost, 0)"
    : `CASE WHEN ${damageYearExpr} = ? THEN COALESCE(m.unit_cost, 0) ELSE 0 END`;
  if (!hasDateRange) matchArgs.push(year);
  pushDateRange(matchWhere, matchArgs, matchDateColumn(dateField), from, to);

  const poWhere = [
    "p.is_foreign = 1",
    "p.is_foc = 0",
    "l.sku IS NOT NULL AND TRIM(l.sku) != ''",
    lSku.sql,
  ];
  const poArgs: (string | number)[] = [...matchArgs, ...lSku.args];
  if (dateField === "po") {
    pushDateRange(poWhere, poArgs, poDateExpr("p"), from, to);
  }

  const r = await db.execute({
    sql: `
    SELECT
      p.id as po_id,
      COALESCE(NULLIF(NULLIF(TRIM(p.reference), ''), '-'), p.po_number) as po_number_out,
      p.po_number,
      p.reference,
      p.po_date,
      p.status,
      p.payment_status,
      p.supplier_name,
      l.sku,
      l.product_name,
      l.quantity,
      l.unit_cost,
      COALESCE(m.matched_cases, 0) as matched_cases,
      CASE
        WHEN l.quantity > 0 THEN ROUND(COALESCE(m.matched_cases, 0) * 100.0 / l.quantity, 2)
        ELSE NULL
      END as claim_rate_pct,
      COALESCE(m.damage_amount, 0) as damage_amount
    FROM (
      SELECT l.po_id, l.sku,
             MAX(l.product_name) as product_name,
             SUM(l.quantity) as quantity,
             CASE
               WHEN SUM(l.quantity) > 0
               THEN SUM(l.quantity * COALESCE(l.unit_cost, 0)) * 1.0 / SUM(l.quantity)
               ELSE MAX(l.unit_cost)
             END as unit_cost
      FROM purchase_order_lines l
      GROUP BY l.po_id, l.sku
    ) l
    JOIN purchase_orders p ON p.id = l.po_id
    LEFT JOIN (
      SELECT m.po_id, m.sku,
             COUNT(*) as matched_cases,
             SUM(${damageSql}) as damage_amount
      ${matchFromSql()}
      WHERE ${matchWhere.join(" AND ")}
      GROUP BY m.po_id, m.sku
    ) m ON m.po_id = l.po_id AND m.sku = l.sku
    WHERE ${poWhere.join(" AND ")}
    ORDER BY damage_amount DESC, p.po_date DESC
  `,
    args: poArgs,
  });
  return (r.rows as Record<string, unknown>[]).map((row) => ({
    po_id: Number(row.po_id),
    po_number_out: String(row.po_number_out ?? ""),
    po_number: String(row.po_number ?? ""),
    reference: String(row.reference ?? ""),
    po_date: row.po_date != null ? String(row.po_date) : null,
    status: row.status != null ? String(row.status) : null,
    payment_status: row.payment_status != null ? String(row.payment_status) : null,
    supplier_name: String(row.supplier_name ?? ""),
    sku: String(row.sku ?? ""),
    product_name: String(row.product_name ?? "").trim() || String(row.sku ?? ""),
    quantity: Number(row.quantity ?? 0),
    unit_cost: Number(row.unit_cost ?? 0),
    matched_cases: Number(row.matched_cases ?? 0),
    claim_rate_pct: row.claim_rate_pct != null ? Number(row.claim_rate_pct) : null,
    damage_amount: Number(row.damage_amount ?? 0),
  }));
}

export async function getFactoryMatches(opts: {
  search?: string;
  type?: "repair" | "claim" | "all";
  tier?: PoMatchTier | "all";
  sku?: string;
  skus?: string[] | null;
  from?: string;
  to?: string;
  dateField?: FactoryDateField;
  page?: number;
  limit?: number;
}): Promise<{ rows: FactoryMatchRow[]; total: number; page: number; limit: number }> {
  await ensure();
  const db = getDb();
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(10, opts.limit ?? 50));
  const offset = (page - 1) * limit;
  const { selected, from, to, dateField } = normalizeFilters(opts);
  const where: string[] = [SQL_NOT_VOIDED, inWarrantySql()];
  const args: (string | number)[] = [];
  pushDateRange(where, args, matchDateColumn(dateField), from, to);

  const fromSql = `
    FROM po_case_matches m
    JOIN tasks t ON t.id = m.task_id
    LEFT JOIN (
      SELECT po_id, sku, MAX(product_name) as product_name
      FROM purchase_order_lines
      GROUP BY po_id, sku
    ) l ON l.po_id = m.po_id AND l.sku = m.sku
    LEFT JOIN task_details td ON td.task_id = m.task_id
  `;
  const productNameExpr = `COALESCE(NULLIF(TRIM(l.product_name), ''), NULLIF(TRIM(td.product_model), ''), m.sku)`;
  const daysExpr = daysToRepairExpr();

  if (opts.type && opts.type !== "all") {
    where.push("m.task_type = ?");
    args.push(opts.type);
  }
  if (opts.tier && opts.tier !== "all") {
    where.push("m.match_tier = ?");
    args.push(opts.tier);
  }
  const skuList = skuInSql("m.sku", selected);
  where.push(skuList.sql);
  args.push(...skuList.args);
  if (opts.sku && opts.sku.trim()) {
    where.push("m.sku = ?");
    args.push(opts.sku.trim());
  }
  if (opts.search && opts.search.trim()) {
    where.push(
      `(m.task_number LIKE ? OR m.sku LIKE ? OR ${productNameExpr} LIKE ? OR m.po_number_out LIKE ? OR m.supplier_name LIKE ?)`
    );
    const q = `%${opts.search.trim()}%`;
    args.push(q, q, q, q, q);
  }
  const whereSql = where.join(" AND ");

  const count = await db.execute({
    sql: `SELECT COUNT(*) as c ${fromSql} WHERE ${whereSql}`,
    args,
  });
  const total = Number((count.rows[0] as { c?: number })?.c ?? 0);

  const r = await db.execute({
    sql: `SELECT m.*, ${productNameExpr} as product_name, ${daysExpr} as days_to_repair
          ${fromSql}
          WHERE ${whereSql}
          ORDER BY CASE m.match_tier
            WHEN 'orange' THEN 0 WHEN 'yellow' THEN 1 WHEN 'green' THEN 2 ELSE 3 END,
            m.ref_date DESC, m.task_number DESC
          LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  });

  const rows: FactoryMatchRow[] = (r.rows as Record<string, unknown>[]).map((row) => ({
    task_id: String(row.task_id ?? ""),
    task_number: String(row.task_number ?? ""),
    task_type: String(row.task_type ?? ""),
    sku: String(row.sku ?? ""),
    product_name: String(row.product_name ?? "").trim() || String(row.sku ?? ""),
    supplier_name: String(row.supplier_name ?? ""),
    ref_date: row.ref_date != null ? String(row.ref_date) : null,
    ref_date_source: String(row.ref_date_source ?? ""),
    match_tier: (row.match_tier as PoMatchTier) ?? "gray",
    po_id: row.po_id != null ? Number(row.po_id) : null,
    po_number_out: row.po_number_out != null ? String(row.po_number_out) : null,
    po_date: row.po_date != null ? String(row.po_date) : null,
    po_status: row.po_status != null ? String(row.po_status) : null,
    po_payment_status: row.po_payment_status != null ? String(row.po_payment_status) : null,
    unit_cost: row.unit_cost != null ? Number(row.unit_cost) : null,
    po_sku_qty: row.po_sku_qty != null ? Number(row.po_sku_qty) : null,
    match_note: String(row.match_note ?? ""),
    claims_on_this_po_sku: row.claims_on_this_po_sku != null ? Number(row.claims_on_this_po_sku) : null,
    claim_rate_pct: row.claim_rate_pct != null ? Number(row.claim_rate_pct) : null,
    days_to_repair: row.days_to_repair != null ? Number(row.days_to_repair) : null,
  }));

  return { rows, total, page, limit };
}
