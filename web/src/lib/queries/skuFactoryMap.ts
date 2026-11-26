import { getDb } from "../db";
import { bangkokDate } from "../bangkokDate";
import { resolveFactorySkus, skuInSql } from "../factoryClaimSkus";
import { SQL_NOT_VOIDED } from "../taskStatus";
import { sqlInWarranty } from "../warrantyBuffer";
import { ensureSupplierFactory, listFactoryCatalog, matchFactoryId } from "./factoryPortalDecisions";

export type SkuFactoryStatus = "confirmed" | "excluded";

export interface SkuFactoryRow {
  sku: string;
  model: string;
  pending: number;
  supplierName: string | null;
  suggestedSupplierName: string | null;
  suggestedFactoryId: string | null;
  suggestedFactoryName: string | null;
  status: SkuFactoryStatus | null;
  factoryId: string | null;
  reason: string | null;
}

export interface ConfirmedSkuFactory {
  status: SkuFactoryStatus;
  factoryId: string | null;
}

let ensured = false;

async function ensureTable(): Promise<void> {
  if (ensured) return;
  await getDb().execute(`
    CREATE TABLE IF NOT EXISTS sku_factory_map (
      sku TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      factory_id TEXT,
      reason TEXT,
      updated_at TEXT
    )
  `);
  ensured = true;
}

export async function confirmedSkuFactories(): Promise<Map<string, ConfirmedSkuFactory>> {
  await ensureTable();
  const result = await getDb().execute(`SELECT sku, status, factory_id FROM sku_factory_map`);
  const map = new Map<string, ConfirmedSkuFactory>();
  for (const raw of result.rows) {
    const row = raw as Record<string, unknown>;
    const status = String(row.status ?? "");
    if (status !== "confirmed" && status !== "excluded") continue;
    map.set(String(row.sku), {
      status,
      factoryId: row.factory_id != null ? String(row.factory_id) : null,
    });
  }
  return map;
}

export async function listPoSuppliers(): Promise<{ name: string }[]> {
  const result = await getDb().execute(`
    SELECT TRIM(supplier_name) AS name
    FROM purchase_orders
    WHERE supplier_name IS NOT NULL AND TRIM(supplier_name) != ''
    GROUP BY TRIM(supplier_name)
    ORDER BY name
  `);
  return result.rows.map((raw) => ({ name: String((raw as Record<string, unknown>).name ?? "") })).filter((row) => row.name);
}

export async function listSkuFactoryRows(): Promise<{ pendingSkus: number; rows: SkuFactoryRow[]; suppliers: { name: string }[] }> {
  await ensureTable();
  const db = getDb();
  const today = bangkokDate();
  const skuFilter = skuInSql("td.sku", resolveFactorySkus(null));
  const created = `date(datetime(t.timestamp / 1000, 'unixepoch', '+7 hours'))`;
  const tasks = await db.execute({
    sql: `
      SELECT td.sku AS sku,
             COALESCE(NULLIF(TRIM(td.product_model), ''), td.sku) AS model,
             m.supplier_name AS supplier_name,
             SUM(CASE WHEN bt.task_id IS NULL THEN 1 ELSE 0 END) AS pending
      FROM tasks t
      JOIN task_details td ON td.task_id = t.id
      LEFT JOIN po_case_matches m ON m.task_id = t.id
      LEFT JOIN (
        SELECT task_id FROM claim_comp_batch_tasks GROUP BY task_id
      ) bt ON bt.task_id = t.id
      WHERE ${SQL_NOT_VOIDED}
        AND ${sqlInWarranty()}
        AND ${skuFilter.sql}
        AND ${created} >= ?
        AND ${created} <= ?
      GROUP BY td.sku, model, m.supplier_name
    `,
    args: [...skuFilter.args, `${today.slice(0, 4)}-01-01`, today],
  });

  const qty = await db.execute(`
    SELECT l.sku AS sku, p.supplier_name AS supplier_name, SUM(COALESCE(l.quantity, 0)) AS qty
    FROM purchase_order_lines l
    JOIN purchase_orders p ON p.id = l.po_id
    WHERE p.is_foreign = 1 AND l.sku IS NOT NULL AND TRIM(l.sku) != ''
    GROUP BY l.sku, p.supplier_name
  `);
  const bestQty = new Map<string, { supplier: string; qty: number }>();
  for (const raw of qty.rows) {
    const row = raw as Record<string, unknown>;
    const sku = String(row.sku ?? "");
    const supplier = String(row.supplier_name ?? "");
    const amount = Number(row.qty ?? 0);
    const current = bestQty.get(sku);
    if (!current || amount > current.qty) bestQty.set(sku, { supplier, qty: amount });
  }

  const saved = await confirmedSkuFactories();
  const names = new Map(listFactoryCatalog().map((factory) => [factory.id, factory.shortName]));
  const grouped = new Map<string, SkuFactoryRow & { matched: boolean }>();
  for (const raw of tasks.rows) {
    const row = raw as Record<string, unknown>;
    const sku = String(row.sku ?? "").trim();
    if (!sku) continue;
    const supplier = row.supplier_name != null ? String(row.supplier_name) : null;
    const pending = Number(row.pending ?? 0);
    const existing = grouped.get(sku) ?? {
      sku,
      model: String(row.model ?? sku),
      pending: 0,
      supplierName: null as string | null,
      suggestedSupplierName: null as string | null,
      suggestedFactoryId: null as string | null,
      suggestedFactoryName: null as string | null,
      status: saved.get(sku)?.status ?? null,
      factoryId: saved.get(sku)?.factoryId ?? null,
      reason: null as string | null,
      matched: false,
    };
    existing.pending += pending;
    if (matchFactoryId(supplier)) existing.matched = true;
    else if (supplier && !existing.supplierName) existing.supplierName = supplier;
    grouped.set(sku, existing);
  }

  const rows = [...grouped.values()]
    .filter((row) => row.status == null && !row.matched)
    .map((row) => {
      const suggestion = bestQty.get(row.sku);
      const suggestedSupplier = suggestion?.supplier ?? null;
      const suggestedId = matchFactoryId(suggestedSupplier);
      return {
        ...row,
        supplierName: row.supplierName ?? suggestedSupplier,
        suggestedSupplierName: suggestedSupplier,
        suggestedFactoryId: suggestedId,
        suggestedFactoryName: suggestedId ? names.get(suggestedId) ?? suggestedSupplier : suggestedSupplier,
      };
    })
    .sort((a, b) => b.pending - a.pending || a.sku.localeCompare(b.sku));

  return { pendingSkus: rows.length, rows, suppliers: await listPoSuppliers() };
}

/** Confirm every unmapped SKU that has a PO supplier suggestion. SKUs with no PO stay for a person to choose. */
export async function confirmSuggestedSkuFactories(): Promise<{ confirmed: { sku: string; factoryId: string; supplier: string }[]; skipped: string[] }> {
  const { rows } = await listSkuFactoryRows();
  const confirmed: { sku: string; factoryId: string; supplier: string }[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    const supplier = row.suggestedSupplierName?.trim() ?? "";
    if (!supplier) {
      skipped.push(row.sku);
      continue;
    }
    const saved = await setSkuFactory({ sku: row.sku, supplierName: supplier });
    if (!saved.ok) {
      skipped.push(row.sku);
      continue;
    }
    confirmed.push({ sku: row.sku, factoryId: saved.factoryId ?? "", supplier });
  }
  return { confirmed, skipped };
}

export async function setSkuFactory(input: {
  sku: string;
  factoryId?: string | null;
  supplierName?: string | null;
  exclude?: boolean;
  reason?: string | null;
}): Promise<{ ok: true; factoryId: string | null } | { ok: false; error: string }> {
  await ensureTable();
  const sku = input.sku.trim();
  if (!sku) return { ok: false, error: "ไม่มี SKU" };
  if (input.exclude) {
    const reason = (input.reason ?? "").trim();
    if (reason.length < 3) return { ok: false, error: "ใส่เหตุผลที่ไม่เคลมโรงงาน" };
    await getDb().execute({
      sql: `INSERT INTO sku_factory_map (sku, status, factory_id, reason, updated_at)
            VALUES (?, 'excluded', NULL, ?, ?)
            ON CONFLICT(sku) DO UPDATE SET status = 'excluded', factory_id = NULL, reason = excluded.reason, updated_at = excluded.updated_at`,
      args: [sku, reason, new Date().toISOString()],
    });
    return { ok: true, factoryId: null };
  }
  let factoryId = (input.factoryId ?? "").trim();
  const supplierName = (input.supplierName ?? "").trim();
  if (supplierName) {
    const created = await ensureSupplierFactory(supplierName);
    if ("error" in created) return { ok: false, error: created.error };
    factoryId = created.id;
  }
  if (!factoryId) return { ok: false, error: "เลือก supplier จาก PO" };
  await getDb().execute({
    sql: `INSERT INTO sku_factory_map (sku, status, factory_id, reason, updated_at)
          VALUES (?, 'confirmed', ?, NULL, ?)
          ON CONFLICT(sku) DO UPDATE SET status = 'confirmed', factory_id = excluded.factory_id, reason = NULL, updated_at = excluded.updated_at`,
    args: [sku, factoryId, new Date().toISOString()],
  });
  return { ok: true, factoryId };
}
