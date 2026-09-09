export const ELIGIBLE_STATUS = "Success";
export const ELIGIBLE_PAYMENTS = new Set([
  "Partial Payment",
  "Paid",
  "Pending",
]);

export type MatchTier = "green" | "orange" | "yellow" | "gray";
export type RefDateSource = "warranty_start_date" | "create_date" | "none";

export interface PoCandidate {
  poId: number;
  poNumber: string;
  reference: string;
  poDate: string;
  status: string;
  paymentStatus: string;
  supplierName: string;
  sku: string;
  quantity: number;
  unitCost: number;
}

export interface CaseInput {
  taskId: string;
  taskNumber: string;
  taskType: string;
  sku: string;
  warrantyStartDate: string | null;
  createDate: string | null;
}

export interface CaseMatch {
  taskId: string;
  taskNumber: string;
  taskType: string;
  sku: string;
  supplierName: string;
  refDate: string | null;
  refDateSource: RefDateSource;
  matchTier: MatchTier;
  poId: number | null;
  poNumberOut: string | null;
  poDate: string | null;
  poStatus: string | null;
  poPaymentStatus: string | null;
  unitCost: number | null;
  poSkuQty: number | null;
  matchNote: string;
  claimsOnThisPoSku: number | null;
  claimRatePct: number | null;
}

export function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function displayPoNumber(reference: string, poNumber: string): string {
  const ref = (reference ?? "").trim();
  if (!ref || ref === "-") return (poNumber ?? "").trim();
  return ref;
}

export function isEligible(c: PoCandidate): boolean {
  return c.status === ELIGIBLE_STATUS && ELIGIBLE_PAYMENTS.has(c.paymentStatus);
}

function pickNearestOnOrBefore(
  cands: PoCandidate[],
  refDate: string
): PoCandidate | null {
  const before = cands.filter((c) => c.poDate && c.poDate <= refDate);
  if (before.length === 0) return null;
  before.sort((a, b) => {
    if (a.poDate !== b.poDate) return a.poDate < b.poDate ? 1 : -1;
    const aVoid = a.status === "Voided" ? 1 : 0;
    const bVoid = b.status === "Voided" ? 1 : 0;
    if (aVoid !== bVoid) return aVoid - bVoid;
    const aEl = isEligible(a) ? 0 : 1;
    const bEl = isEligible(b) ? 0 : 1;
    if (aEl !== bEl) return aEl - bEl;
    return b.poId - a.poId;
  });
  return before[0];
}

function pickEarliest(cands: PoCandidate[]): PoCandidate | null {
  if (cands.length === 0) return null;
  const copy = [...cands];
  copy.sort((a, b) => {
    if (a.poDate !== b.poDate) return a.poDate < b.poDate ? -1 : 1;
    const aVoid = a.status === "Voided" ? 1 : 0;
    const bVoid = b.status === "Voided" ? 1 : 0;
    if (aVoid !== bVoid) return aVoid - bVoid;
    return a.poId - b.poId;
  });
  return copy[0];
}

function applyPo(match: CaseMatch, po: PoCandidate): void {
  match.poId = po.poId;
  match.poNumberOut = displayPoNumber(po.reference, po.poNumber);
  match.poDate = po.poDate;
  match.poStatus = po.status;
  match.poPaymentStatus = po.paymentStatus;
  match.supplierName = po.supplierName;
  match.unitCost = po.unitCost;
  match.poSkuQty = po.quantity;
}

export function matchCase(
  input: CaseInput,
  candidates: PoCandidate[]
): CaseMatch {
  const sku = (input.sku ?? "").trim();
  const warranty = toDateOnly(input.warrantyStartDate);
  const created = toDateOnly(input.createDate);
  const refDate = warranty ?? created;
  const refDateSource: RefDateSource = warranty
    ? "warranty_start_date"
    : created
      ? "create_date"
      : "none";

  const base: CaseMatch = {
    taskId: input.taskId,
    taskNumber: input.taskNumber,
    taskType: input.taskType,
    sku,
    supplierName: "",
    refDate,
    refDateSource,
    matchTier: "gray",
    poId: null,
    poNumberOut: null,
    poDate: null,
    poStatus: null,
    poPaymentStatus: null,
    unitCost: null,
    poSkuQty: null,
    matchNote:
      "ไม่มี mapping ซัพพลายเออร์/SKU หรือไม่มี PO ของ SKU นี้ในไฟล์ — เว้น PO ว่าง",
    claimsOnThisPoSku: null,
    claimRatePct: null,
  };

  if (!sku || candidates.length === 0) return base;
  if (!refDate) {
    base.matchNote = "ไม่มีวันที่อ้างอิง (warranty_start_date / create_date)";
    return base;
  }

  const eligible = candidates.filter(isEligible);
  const tier1 = pickNearestOnOrBefore(eligible, refDate);
  if (tier1) {
    applyPo(base, tier1);
    base.matchTier = "green";
    base.matchNote =
      "ทียร์ 1: PO ที่ผ่านเงื่อนไข (Status=Success และ Payment=Paid/Partial Payment/Pending) ใกล้สุดในหรือก่อนวันอ้างอิง";
    return base;
  }

  const tier2 = pickNearestOnOrBefore(candidates, refDate);
  if (tier2) {
    applyPo(base, tier2);
    base.matchTier = "orange";
    base.matchNote =
      "ทียร์ 2: ไม่มี PO ที่ผ่านเงื่อนไขก่อนวันอ้างอิง — ใช้ PO ใกล้สุดก่อนวันอ้างอิงจากทุกสถานะ (ต้องตรวจกับจัดซื้อ) ไม่กระโดดไปข้างหน้า";
    return base;
  }

  const tier3 = pickEarliest(candidates);
  if (tier3) {
    applyPo(base, tier3);
    base.matchTier = "yellow";
    base.matchNote =
      "ทียร์ 3: ไม่มี PO ของ SKU นี้ในหรือก่อนวันอ้างอิง — ใช้ PO ใบแรกสุดเป็นประมาณการ fallback";
    return base;
  }

  return base;
}

export function attachClaimRates(matches: CaseMatch[]): void {
  const counts = new Map<string, number>();
  const qty = new Map<string, number>();
  for (const m of matches) {
    if (m.matchTier === "gray" || m.poId == null || !m.sku) continue;
    const key = `${m.poId}::${m.sku}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!qty.has(key) && m.poSkuQty != null) qty.set(key, m.poSkuQty);
  }
  for (const m of matches) {
    if (m.matchTier === "gray" || m.poId == null || !m.sku) continue;
    const key = `${m.poId}::${m.sku}`;
    const n = counts.get(key) ?? 0;
    const q = qty.get(key);
    m.claimsOnThisPoSku = n;
    if (q != null && q > 0) {
      m.claimRatePct = Math.round((n / q) * 10000) / 100;
    } else {
      m.claimRatePct = null;
    }
  }
}
