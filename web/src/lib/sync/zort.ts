import { getDb } from "../db";
import { ensureNewColumns } from "../migrate";
import { SQL_NOT_VOIDED } from "../taskStatus";
import { isFocText, isForeignFactory } from "./foreignSupplier";
import {
  attachClaimRates,
  matchCase,
  toDateOnly,
  type CaseInput,
  type PoCandidate,
} from "./poMatch";

const ZORT_URL =
  "https://open-api.zortout.com/v4/PurchaseOrder/GetPurchaseOrders";
const PAGE_SIZE = 500;

export interface ZortSyncResult {
  fetched: number;
  stored: number;
  lines: number;
  skippedDomestic: number;
  skippedFocSupplier: number;
  matched: number;
  gray: number;
  createdAfter: string;
}

interface ZortLine {
  id?: number;
  sku?: string;
  name?: string;
  number?: number;
  pricepernumber?: number;
  totalprice?: number;
}

interface ZortPo {
  id?: number;
  number?: string;
  purchaseorderdate?: string;
  purchaseorderdateString?: string;
  status?: string;
  paymentstatus?: string;
  customername?: string;
  customercode?: string;
  reference?: string;
  amount?: number;
  paymentamount?: number;
  currency?: string;
  createusername?: string;
  createdatetime?: string;
  updatedatetime?: string;
  list?: ZortLine[];
}

function bangkokYearMinusOneJan1(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value ?? new Date().getFullYear()) - 1;
  return `${year}-01-01`;
}

function poDateTs(dateOnly: string | null): number | null {
  if (!dateOnly) return null;
  const t = Date.parse(`${dateOnly}T00:00:00+07:00`);
  return Number.isFinite(t) ? t : null;
}

async function fetchPage(
  page: number,
  createdAfter: string,
  headers: Record<string, string>
): Promise<{ list: ZortPo[]; count: number }> {
  const url = `${ZORT_URL}?limit=${PAGE_SIZE}&page=${page}&createdafter=${encodeURIComponent(createdAfter)}`;
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    throw new Error(`Zort PO HTTP ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as {
    list?: ZortPo[];
    count?: number;
    res?: { resCode?: string; resDesc?: string };
  };
  if (json.res?.resCode && json.res.resCode !== "200") {
    throw new Error(`Zort PO resCode=${json.res.resCode} ${json.res.resDesc ?? ""}`);
  }
  return { list: json.list ?? [], count: Number(json.count ?? 0) };
}

async function fetchAllPos(createdAfter: string): Promise<ZortPo[]> {
  const storename = process.env.ZORT_STORENAME ?? "";
  const apikey = process.env.ZORT_API_KEY ?? "";
  const apisecret = process.env.ZORT_API_SECRET ?? "";
  if (!storename || !apikey || !apisecret) {
    throw new Error("Missing ZORT_STORENAME / ZORT_API_KEY / ZORT_API_SECRET");
  }
  const headers = {
    storename,
    apikey,
    apisecret,
    Accept: "application/json",
  };
  const all: ZortPo[] = [];
  let page = 1;
  while (page <= 40) {
    const { list, count } = await fetchPage(page, createdAfter, headers);
    all.push(...list);
    if (list.length < PAGE_SIZE) break;
    if (count > 0 && all.length >= count) break;
    page++;
  }
  return all;
}

export async function syncPurchaseOrders(): Promise<ZortSyncResult> {
  await ensureNewColumns();
  const createdAfter = bangkokYearMinusOneJan1();
  const raw = await fetchAllPos(createdAfter);
  const syncedAt = new Date().toISOString();

  let skippedDomestic = 0;
  let skippedFocSupplier = 0;
  const keep: ZortPo[] = [];
  for (const po of raw) {
    const name = (po.customername ?? "").trim();
    if (isFocText(name) && !isForeignFactory(name)) {
      skippedFocSupplier++;
      continue;
    }
    if (!isForeignFactory(name)) {
      skippedDomestic++;
      continue;
    }
    keep.push(po);
  }

  const db = getDb();
  await db.execute("DELETE FROM po_case_matches");
  await db.execute("DELETE FROM purchase_order_lines");
  await db.execute("DELETE FROM purchase_orders");

  let lines = 0;
  const poStmts: { sql: string; args: (string | number | null)[] }[] = [];
  const lineStmts: { sql: string; args: (string | number | null)[] }[] = [];

  for (const po of keep) {
    const id = Number(po.id);
    if (!Number.isFinite(id)) continue;
    const poNumber = String(po.number ?? "");
    const reference = String(po.reference ?? "");
    const supplier = String(po.customername ?? "").trim();
    const foc = isFocText(poNumber, reference) ? 1 : 0;
    const dateOnly = toDateOnly(po.purchaseorderdateString ?? po.purchaseorderdate);
    const lineList = Array.isArray(po.list) ? po.list : [];
    const totalQty = lineList.reduce((s, li) => s + Number(li.number ?? 0), 0);

    poStmts.push({
      sql: `INSERT INTO purchase_orders (
        id, po_number, po_date, po_date_ts, status, payment_status,
        supplier_name, supplier_code, reference, total_amount, total_quantity,
        payment_amount, currency, created_by, payment_term, is_foc, is_foreign,
        created_at_src, updated_at_src, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        poNumber,
        dateOnly,
        poDateTs(dateOnly),
        po.status ?? null,
        po.paymentstatus ?? null,
        supplier,
        po.customercode ?? null,
        reference,
        Number(po.amount ?? 0),
        totalQty,
        Number(po.paymentamount ?? 0),
        po.currency ?? "THB",
        po.createusername ?? null,
        null,
        foc,
        1,
        po.createdatetime ?? null,
        po.updatedatetime ?? null,
        syncedAt,
      ],
    });

    for (const li of lineList) {
      const lineId = Number(li.id);
      if (!Number.isFinite(lineId)) continue;
      lineStmts.push({
        sql: `INSERT INTO purchase_order_lines (
          id, po_id, sku, product_name, quantity, unit_cost, total_price
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          lineId,
          id,
          (li.sku ?? "").trim(),
          li.name ?? null,
          Number(li.number ?? 0),
          Number(li.pricepernumber ?? 0),
          Number(li.totalprice ?? 0),
        ],
      });
      lines++;
    }
  }

  for (let i = 0; i < poStmts.length; i += 40) {
    await db.batch(poStmts.slice(i, i + 40), "write");
  }
  for (let i = 0; i < lineStmts.length; i += 40) {
    await db.batch(lineStmts.slice(i, i + 40), "write");
  }

  const matchStats = await recomputePoMatches();

  await db.execute({
    sql: `INSERT INTO sync_log (
      sync_type, workflow_ids, started_at, finished_at,
      repair_fetched, claim_fetched, total_upserted, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "purchase_orders",
      createdAfter,
      syncedAt,
      new Date().toISOString(),
      keep.length,
      lines,
      matchStats.matched,
      "success",
    ],
  });

  return {
    fetched: raw.length,
    stored: keep.length,
    lines,
    skippedDomestic,
    skippedFocSupplier,
    matched: matchStats.matched,
    gray: matchStats.gray,
    createdAfter,
  };
}

export async function recomputePoMatches(): Promise<{ matched: number; gray: number }> {
  const db = getDb();

  const poRes = await db.execute(`
    SELECT p.id, p.po_number, p.reference, p.po_date, p.status, p.payment_status,
           p.supplier_name, p.is_foc, l.sku, l.quantity, l.unit_cost
    FROM purchase_orders p
    JOIN purchase_order_lines l ON l.po_id = p.id
    WHERE p.is_foreign = 1 AND p.is_foc = 0
      AND l.sku IS NOT NULL AND TRIM(l.sku) != ''
      AND p.po_date IS NOT NULL AND TRIM(p.po_date) != ''
  `);

  const bySku = new Map<string, PoCandidate[]>();
  for (const row of poRes.rows as Record<string, unknown>[]) {
    const sku = String(row.sku ?? "").trim();
    const cand: PoCandidate = {
      poId: Number(row.id),
      poNumber: String(row.po_number ?? ""),
      reference: String(row.reference ?? ""),
      poDate: String(row.po_date ?? ""),
      status: String(row.status ?? ""),
      paymentStatus: String(row.payment_status ?? ""),
      supplierName: String(row.supplier_name ?? ""),
      sku,
      quantity: Number(row.quantity ?? 0),
      unitCost: Number(row.unit_cost ?? 0),
    };
    const arr = bySku.get(sku) ?? [];
    arr.push(cand);
    bySku.set(sku, arr);
  }

  const taskRes = await db.execute(`
    SELECT t.id, t.task_number, t.task_type, td.sku, td.warranty_start_date, td.create_date
    FROM tasks t
    JOIN task_details td ON td.task_id = t.id
    WHERE ${SQL_NOT_VOIDED}
  `);

  const matches = [];
  for (const row of taskRes.rows as Record<string, unknown>[]) {
    const input: CaseInput = {
      taskId: String(row.id ?? ""),
      taskNumber: String(row.task_number ?? ""),
      taskType: String(row.task_type ?? ""),
      sku: String(row.sku ?? ""),
      warrantyStartDate: row.warranty_start_date != null ? String(row.warranty_start_date) : null,
      createDate: row.create_date != null ? String(row.create_date) : null,
    };
    if (!input.taskId) continue;
    const cands = bySku.get(input.sku.trim()) ?? [];
    matches.push(matchCase(input, cands));
  }
  attachClaimRates(matches);

  await db.execute("DELETE FROM po_case_matches");
  const updatedAt = new Date().toISOString();
  const stmts: { sql: string; args: (string | number | null)[] }[] = matches.map((m) => ({
    sql: `INSERT INTO po_case_matches (
      task_id, task_number, task_type, sku, supplier_name, ref_date, ref_date_source,
      match_tier, po_id, po_number_out, po_date, po_status, po_payment_status,
      unit_cost, po_sku_qty, match_note, claims_on_this_po_sku, claim_rate_pct, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      m.taskId,
      m.taskNumber,
      m.taskType,
      m.sku,
      m.supplierName,
      m.refDate,
      m.refDateSource,
      m.matchTier,
      m.poId,
      m.poNumberOut,
      m.poDate,
      m.poStatus,
      m.poPaymentStatus,
      m.unitCost,
      m.poSkuQty,
      m.matchNote,
      m.claimsOnThisPoSku,
      m.claimRatePct,
      updatedAt,
    ],
  }));
  for (let i = 0; i < stmts.length; i += 40) {
    await db.batch(stmts.slice(i, i + 40), "write");
  }

  const gray = matches.filter((m) => m.matchTier === "gray").length;
  return { matched: matches.length - gray, gray };
}
