import { getDb } from "../db";
import { ensureNewColumns } from "../migrate";
import { resolveFactorySkus, skuInSql } from "../factoryClaimSkus";
import type {
  FactoryClaimKpis,
  FactoryMatchRow,
  FactoryPoHeaderRow,
  FactoryPoSkuRow,
  PoMatchTier,
} from "@/types/dashboard";

async function ensure(): Promise<void> {
  await ensureNewColumns();
}

function bangkokYear(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).format(new Date());
}

export async function getFactoryKpis(skus?: string[] | null): Promise<FactoryClaimKpis> {
  await ensure();
  const db = getDb();
  const year = bangkokYear();
  const selected = resolveFactorySkus(skus);
  const skuFilter = skuInSql("sku", selected);
  const mSkuFilter = skuInSql("m.sku", selected);
  const lSkuFilter = skuInSql("l.sku", selected);

  const po = await db.execute({
    sql: `SELECT COUNT(DISTINCT p.id) as c
          FROM purchase_orders p
          JOIN purchase_order_lines l ON l.po_id = p.id
          WHERE p.is_foreign = 1 AND ${lSkuFilter.sql}`,
    args: lSkuFilter.args,
  });
  const lines = await db.execute({
    sql: `SELECT COUNT(*) as c FROM purchase_order_lines l
     JOIN purchase_orders p ON p.id = l.po_id
     WHERE p.is_foreign = 1 AND ${lSkuFilter.sql}`,
    args: lSkuFilter.args,
  });
  const tiers = await db.execute({
    sql: `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN match_tier != 'gray' THEN 1 ELSE 0 END) as matched,
      SUM(CASE WHEN match_tier = 'green' THEN 1 ELSE 0 END) as green,
      SUM(CASE WHEN match_tier = 'orange' THEN 1 ELSE 0 END) as orange,
      SUM(CASE WHEN match_tier = 'yellow' THEN 1 ELSE 0 END) as yellow,
      SUM(CASE WHEN match_tier = 'gray' THEN 1 ELSE 0 END) as gray
    FROM po_case_matches
    WHERE ${skuFilter.sql}
  `,
    args: skuFilter.args,
  });
  const damage = await db.execute({
    sql: `
      SELECT COALESCE(SUM(
        CASE WHEN m.match_tier != 'gray'
          AND COALESCE(
            strftime('%Y', datetime(t.timestamp / 1000, 'unixepoch', '+7 hours')),
            substr(td.create_date, 1, 4),
            substr(m.ref_date, 1, 4)
          ) = ?
        THEN COALESCE(m.unit_cost, 0) ELSE 0 END
      ), 0) as damage_total
      FROM po_case_matches m
      LEFT JOIN tasks t ON t.id = m.task_id
      LEFT JOIN task_details td ON td.task_id = m.task_id
      WHERE ${mSkuFilter.sql}
    `,
    args: [year, ...mSkuFilter.args],
  });
  const sync = await db.execute(
    `SELECT finished_at FROM sync_log WHERE sync_type = 'purchase_orders' ORDER BY id DESC LIMIT 1`
  );
  const t = (tiers.rows[0] ?? {}) as Record<string, unknown>;
  return {
    po_count: Number((po.rows[0] as { c?: number })?.c ?? 0),
    line_count: Number((lines.rows[0] as { c?: number })?.c ?? 0),
    case_total: Number(t.total ?? 0),
    matched: Number(t.matched ?? 0),
    green: Number(t.green ?? 0),
    orange: Number(t.orange ?? 0),
    yellow: Number(t.yellow ?? 0),
    gray: Number(t.gray ?? 0),
    damage_total: Number((damage.rows[0] as { damage_total?: number })?.damage_total ?? 0),
    damage_year: year,
    last_synced_at: ((sync.rows[0] as { finished_at?: string } | undefined)?.finished_at) ?? null,
  };
}

export async function getFactoryPoHeaders(skus?: string[] | null): Promise<FactoryPoHeaderRow[]> {
  await ensure();
  const db = getDb();
  const selected = resolveFactorySkus(skus);
  const lSku = skuInSql("l.sku", selected);
  const r = await db.execute({
    sql: `
    SELECT id, po_number, po_date, status, payment_status, supplier_name, supplier_code,
           reference, total_amount, total_quantity, payment_amount, currency, created_by, payment_term
    FROM purchase_orders
    WHERE is_foreign = 1
      AND id IN (SELECT l.po_id FROM purchase_order_lines l WHERE ${lSku.sql})
    ORDER BY po_date DESC, id DESC
  `,
    args: lSku.args,
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

export async function getFactoryPoSkuSummary(skus?: string[] | null): Promise<FactoryPoSkuRow[]> {
  await ensure();
  const db = getDb();
  const selected = resolveFactorySkus(skus);
  const lSku = skuInSql("l.sku", selected);
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
      m.claim_rate_pct,
      COALESCE(m.matched_cases, 0) * COALESCE(l.unit_cost, 0) as damage_amount
    FROM purchase_order_lines l
    JOIN purchase_orders p ON p.id = l.po_id
    LEFT JOIN (
      SELECT po_id, sku,
             COUNT(*) as matched_cases,
             MAX(claim_rate_pct) as claim_rate_pct
      FROM po_case_matches
      WHERE match_tier != 'gray' AND po_id IS NOT NULL
      GROUP BY po_id, sku
    ) m ON m.po_id = l.po_id AND m.sku = l.sku
    WHERE p.is_foreign = 1 AND p.is_foc = 0
      AND l.sku IS NOT NULL AND TRIM(l.sku) != ''
      AND ${lSku.sql}
    ORDER BY damage_amount DESC, p.po_date DESC
  `,
    args: lSku.args,
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
  page?: number;
  limit?: number;
}): Promise<{ rows: FactoryMatchRow[]; total: number; page: number; limit: number }> {
  await ensure();
  const db = getDb();
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(10, opts.limit ?? 50));
  const offset = (page - 1) * limit;
  const where: string[] = ["1=1"];
  const args: (string | number | null)[] = [];

  const fromSql = `
    FROM po_case_matches m
    LEFT JOIN (
      SELECT po_id, sku, MAX(product_name) as product_name
      FROM purchase_order_lines
      GROUP BY po_id, sku
    ) l ON l.po_id = m.po_id AND l.sku = m.sku
    LEFT JOIN task_details td ON td.task_id = m.task_id
  `;
  const productNameExpr = `COALESCE(NULLIF(TRIM(l.product_name), ''), NULLIF(TRIM(td.product_model), ''), m.sku)`;

  if (opts.type && opts.type !== "all") {
    where.push("m.task_type = ?");
    args.push(opts.type);
  }
  if (opts.tier && opts.tier !== "all") {
    where.push("m.match_tier = ?");
    args.push(opts.tier);
  }
  const selected = resolveFactorySkus(opts.skus);
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
    sql: `SELECT m.*, ${productNameExpr} as product_name
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
  }));

  return { rows, total, page, limit };
}
