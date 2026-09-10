"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FACTORY_CLAIM_SKUS } from "@/lib/factoryClaimSkus";
import { ClaimCompensationDialog } from "./ClaimCompensationDialog";
import { SkuExcelFilter } from "./SkuExcelFilter";
import type {
  FactoryClaimKpis,
  FactoryMatchRow,
  FactoryPoHeaderRow,
  FactoryPoSkuRow,
  PoMatchTier,
} from "@/types/dashboard";

const TIER_LABEL: Record<PoMatchTier, string> = {
  green: "ทียร์ 1",
  orange: "ทียร์ 2 ตรวจกับจัดซื้อ",
  yellow: "ทียร์ 3 ประมาณการ",
  gray: "ไม่พบ PO",
};

const TIER_CLASS: Record<PoMatchTier, string> = {
  green: "bg-emerald-100 text-emerald-800 border-emerald-200",
  orange: "bg-orange-100 text-orange-800 border-orange-200",
  yellow: "bg-amber-100 text-amber-900 border-amber-200",
  gray: "bg-slate-100 text-slate-600 border-slate-200",
};

function money(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function num(n: number): string {
  return n.toLocaleString("th-TH");
}

export function FactoryClaimTab() {
  const [kpis, setKpis] = useState<FactoryClaimKpis | null>(null);
  const [skuRows, setSkuRows] = useState<FactoryPoSkuRow[]>([]);
  const [pos, setPos] = useState<FactoryPoHeaderRow[]>([]);
  const [matches, setMatches] = useState<FactoryMatchRow[]>([]);
  const [matchTotal, setMatchTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "repair" | "claim">("all");
  const [tier, setTier] = useState<PoMatchTier | "all">("all");
  const [inner, setInner] = useState<"summary" | "matches" | "pos" | "notes">("summary");
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogSku, setDialogSku] = useState<string | null>(null);
  const [selectedSkus, setSelectedSkus] = useState<string[]>(() => [...FACTORY_CLAIM_SKUS]);
  const [nameBySku, setNameBySku] = useState<Record<string, string>>({});

  const skusQuery = useMemo(() => selectedSkus.join(","), [selectedSkus]);

  const loadKpisAndSummary = useCallback(async () => {
    const qs = `skus=${encodeURIComponent(skusQuery)}`;
    const [k, s, p] = await Promise.all([
      fetch(`/api/dashboard/factory-claims?view=kpis&${qs}`),
      fetch(`/api/dashboard/factory-claims?view=sku-summary&${qs}`),
      fetch(`/api/dashboard/factory-claims?view=pos&${qs}`),
    ]);
    if (!k.ok) throw new Error("โหลด KPI ไม่สำเร็จ");
    setKpis(await k.json());
    if (s.ok) {
      const rows = (await s.json()) as FactoryPoSkuRow[];
      setSkuRows(rows);
      setNameBySku((prev) => {
        const next = { ...prev };
        for (const r of rows) {
          if (r.sku && r.product_name && !next[r.sku]) next[r.sku] = r.product_name;
        }
        return next;
      });
    }
    if (p.ok) setPos(await p.json());
    setLoading(false);
  }, [skusQuery]);

  const loadMatches = useCallback(async () => {
    const params = new URLSearchParams({
      view: "matches",
      page: String(page),
      limit: "50",
      type,
      tier,
      skus: skusQuery,
    });
    if (search.trim()) params.set("search", search.trim());
    const res = await fetch(`/api/dashboard/factory-claims?${params}`);
    if (!res.ok) throw new Error("โหลดรายการจับคู่ไม่สำเร็จ");
    const json = await res.json();
    setMatches(json.rows ?? []);
    setMatchTotal(Number(json.total ?? 0));
  }, [page, type, tier, search, skusQuery]);

  useEffect(() => {
    loadKpisAndSummary().catch((e) => {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    });
  }, [loadKpisAndSummary]);

  useEffect(() => {
    if (inner === "matches") {
      loadMatches().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }
  }, [inner, loadMatches]);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/sync/purchase-orders", { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error ?? "ซิงก์ไม่สำเร็จ");
      setSyncMsg(
        `ดึง ${json.fetched} ใบ · เก็บต่างประเทศ ${json.stored} ใบ · บรรทัด ${json.lines} · จับคู่ได้ ${json.matched} · ไม่พบ PO ${json.gray} (ตั้งแต่ ${json.createdAfter})`
      );
      await loadKpisAndSummary();
      if (inner === "matches") await loadMatches();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  const skuFiltered = search.trim()
    ? skuRows.filter(
        (r) =>
          r.product_name.toLowerCase().includes(search.toLowerCase()) ||
          r.sku.toLowerCase().includes(search.toLowerCase()) ||
          r.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
          r.po_number_out.toLowerCase().includes(search.toLowerCase())
      )
    : skuRows;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">ยอดความเสียหายจากต้นทุน PO โรงงาน</h2>
          <p className="text-sm text-slate-500">
            จับคู่งานซ่อม/เคลมกับ PO ต่างประเทศ · วันอ้างอิง = วันเริ่มประกัน ถ้าไม่มีใช้วันสร้างงาน
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? "กำลังซิงก์ PO..." : "ซิงก์ PO จาก Zort"}
        </Button>
      </div>

      {syncMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {syncMsg}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          title="ยอดเสียหาย (ต้นทุน PO)"
          value={kpis ? money(kpis.damage_total) : "—"}
          hint={kpis ? `บาท · ปี ${kpis.damage_year} · ต่อเคส × ต้นทุนต่อหน่วย` : "บาท · เฉพาะปีปัจจุบัน"}
        />
        <Kpi title="จับคู่ได้" value={kpis ? num(kpis.matched) : "—"} hint={kpis ? `เขียว ${kpis.green} · ส้ม ${kpis.orange} · เหลือง ${kpis.yellow}` : ""} />
        <Kpi title="ไม่พบ PO" value={kpis ? num(kpis.gray) : "—"} hint="ไม่มี SKU ใน PO ต่างประเทศ" />
        <Kpi title="PO ต่างประเทศ" value={kpis ? num(kpis.po_count) : "—"} hint={kpis?.last_synced_at ? `ซิงก์ล่าสุด ${kpis.last_synced_at}` : "ยังไม่ซิงก์"} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["summary", "สรุป PO × สินค้า"],
            ["matches", "รายการงานที่จับคู่"],
            ["pos", "หัว PO"],
            ["notes", "หมายเหตุการจับคู่"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setInner(id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              inner === id ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SkuExcelFilter
            selected={selectedSkus}
            nameBySku={nameBySku}
            onChange={(next) => {
              setSelectedSkus(next);
              setPage(1);
              setLoading(true);
            }}
          />
          <input
            type="text"
            placeholder="ค้นหาชื่อสินค้า / SKU / PO / ซัพพลายเออร์ / เลขงาน"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-8 w-72 rounded-md border border-slate-300 px-3 text-sm"
          />
        </div>
      </div>

      {inner === "summary" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Claim rate ต่อ PO × สินค้า</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 font-medium">PO (Reference)</th>
                    <th className="px-3 py-2 font-medium">วันที่</th>
                    <th className="px-3 py-2 font-medium">ซัพพลายเออร์</th>
                    <th className="px-3 py-2 font-medium">สินค้า</th>
                    <th className="px-3 py-2 font-medium text-right">Qty PO</th>
                    <th className="px-3 py-2 font-medium text-right">ต้นทุน/หน่วย</th>
                    <th className="px-3 py-2 font-medium text-right">งานที่จับคู่</th>
                    <th className="px-3 py-2 font-medium text-right">Claim %</th>
                    <th className="px-3 py-2 font-medium text-right">ยอดเสียหาย</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                        กำลังโหลด...
                      </td>
                    </tr>
                  ) : skuFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                        ไม่พบข้อมูลของ SKU ที่เลือก — ลองเปลี่ยนตัวกรอง หรือกดซิงก์จาก Zort
                      </td>
                    </tr>
                  ) : (
                    skuFiltered.map((r) => (
                      <tr key={`${r.po_id}-${r.sku}`} className="border-b border-slate-100">
                        <td className="px-3 py-2 font-mono text-xs">{r.po_number_out}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.po_date ?? "—"}</td>
                        <td className="px-3 py-2 max-w-[220px] truncate" title={r.supplier_name}>
                          {r.supplier_name}
                        </td>
                        <td className="px-3 py-2 max-w-[280px]" title={r.sku}>
                          {r.product_name}
                        </td>
                        <td className="px-3 py-2 text-right">{num(r.quantity)}</td>
                        <td className="px-3 py-2 text-right">{money(r.unit_cost)}</td>
                        <td className="px-3 py-2 text-right">{num(r.matched_cases)}</td>
                        <td className="px-3 py-2 text-right">
                          {r.claim_rate_pct != null ? `${r.claim_rate_pct.toFixed(2)}%` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{money(r.damage_amount)}</td>
                        <td className="px-3 py-2">
                          <Button
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => setDialogSku(r.sku)}
                          >
                            บันทึกเคลมโรงงาน
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {inner === "matches" && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">งานซ่อม/เคลมที่จับคู่แล้ว</CardTitle>
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as typeof type);
                  setPage(1);
                }}
                className="h-8 rounded-md border border-slate-300 px-2 text-sm"
              >
                <option value="all">ทุกประเภท</option>
                <option value="repair">ซ่อม</option>
                <option value="claim">เคลม</option>
              </select>
              <select
                value={tier}
                onChange={(e) => {
                  setTier(e.target.value as typeof tier);
                  setPage(1);
                }}
                className="h-8 rounded-md border border-slate-300 px-2 text-sm"
              >
                <option value="all">ทุกทียร์</option>
                <option value="green">ทียร์ 1 เขียว</option>
                <option value="orange">ทียร์ 2 ส้ม</option>
                <option value="yellow">ทียร์ 3 เหลือง</option>
                <option value="gray">เทา ไม่พบ</option>
              </select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 font-medium">งาน</th>
                    <th className="px-3 py-2 font-medium">สินค้า</th>
                    <th className="px-3 py-2 font-medium">วันอ้างอิง</th>
                    <th className="px-3 py-2 font-medium">ทียร์</th>
                    <th className="px-3 py-2 font-medium">PO</th>
                    <th className="px-3 py-2 font-medium">ซัพพลายเออร์</th>
                    <th className="px-3 py-2 font-medium text-right">ต้นทุน</th>
                    <th className="px-3 py-2 font-medium text-right">Claim %</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => (
                    <tr key={m.task_id} className="border-b border-slate-100">
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs">{m.task_number}</div>
                        <div className="text-xs text-slate-500">{m.task_type === "claim" ? "เคลม" : "ซ่อม"}</div>
                      </td>
                      <td className="px-3 py-2 max-w-[240px] text-xs" title={m.sku || undefined}>
                        {m.product_name || m.sku || "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        {m.ref_date ?? "—"}
                        <div className="text-slate-400">
                          {m.ref_date_source === "warranty_start_date" ? "วันเริ่มประกัน" : m.ref_date_source === "create_date" ? "วันสร้างงาน" : "ไม่มีวันที่"}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${TIER_CLASS[m.match_tier]}`}>
                          {TIER_LABEL[m.match_tier]}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {m.po_number_out ?? "—"}
                        <div className="text-slate-400">{m.po_date ?? ""} {m.po_status ?? ""} / {m.po_payment_status ?? ""}</div>
                      </td>
                      <td className="px-3 py-2 max-w-[180px] truncate text-xs" title={m.supplier_name}>
                        {m.supplier_name || "—"}
                      </td>
                      <td className="px-3 py-2 text-right">{m.unit_cost != null ? money(m.unit_cost) : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {m.claim_rate_pct != null ? `${m.claim_rate_pct.toFixed(2)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
              <span>
                {num(matchTotal)} รายการ · หน้า {page}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  ก่อนหน้า
                </Button>
                <Button
                  variant="outline"
                  className="h-8"
                  disabled={page * 50 >= matchTotal}
                  onClick={() => setPage((p) => p + 1)}
                >
                  ถัดไป
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {inner === "pos" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">หัว PO ที่ดึงมา (ต่างประเทศเท่านั้น)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 font-medium">PO ID</th>
                    <th className="px-3 py-2 font-medium">PO Number</th>
                    <th className="px-3 py-2 font-medium">Reference</th>
                    <th className="px-3 py-2 font-medium">PO Date</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Payment</th>
                    <th className="px-3 py-2 font-medium">Supplier</th>
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium text-right">Amount</th>
                    <th className="px-3 py-2 font-medium text-right">Qty</th>
                    <th className="px-3 py-2 font-medium text-right">Paid</th>
                    <th className="px-3 py-2 font-medium">Currency</th>
                    <th className="px-3 py-2 font-medium">Created By</th>
                    <th className="px-3 py-2 font-medium">Payment Term</th>
                  </tr>
                </thead>
                <tbody>
                  {pos.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs">{p.id}</td>
                      <td className="px-3 py-2 font-mono text-xs">{p.po_number}</td>
                      <td className="px-3 py-2 font-mono text-xs">{p.reference || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{p.po_date ?? "—"}</td>
                      <td className="px-3 py-2">{p.status ?? "—"}</td>
                      <td className="px-3 py-2">{p.payment_status ?? "—"}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate" title={p.supplier_name}>{p.supplier_name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{p.supplier_code ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{money(p.total_amount)}</td>
                      <td className="px-3 py-2 text-right">{num(p.total_quantity)}</td>
                      <td className="px-3 py-2 text-right">{money(p.payment_amount)}</td>
                      <td className="px-3 py-2">{p.currency ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">{p.created_by ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-400">{p.payment_term ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {inner === "notes" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">หมายเหตุ — อ่านทุกครั้งก่อนใช้ตัวเลขเคลมโรงงาน</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <p>
              การจับคู่ใช้ความใกล้ของวันที่กับ SKU เท่านั้น <strong>ไม่ได้ยืนยันด้วย serial number</strong> จึงเป็นสัญญาณจัดลำดับความสำคัญ ไม่ใช่หลักฐานว่าสินค้าใบนั้นคือเครื่องที่เสีย
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>ทียร์ 1 (เขียว): PO ที่ Status = Success และ Payment อยู่ใน Paid / Partial Payment / Pending ใบที่ใกล้สุดในหรือก่อนวันอ้างอิง</li>
              <li>ทียร์ 2 (ส้ม): ไม่มี PO ที่ผ่านเงื่อนไขก่อนวันอ้างอิง — ใช้ PO ใกล้สุดก่อนวันอ้างอิงจากทุกสถานะ (ไม่กระโดดไปข้างหน้า) ต้องตรวจกับจัดซื้อ</li>
              <li>ทียร์ 3 (เหลือง): ไม่มี PO ของ SKU นี้ก่อนวันอ้างอิงเลย — ใช้ใบแรกสุดเป็นประมาณการ</li>
              <li>เทา: ไม่มีซัพพลายเออร์ต่างประเทศของ SKU นี้ใน PO ที่ดึงมา</li>
              <li>ตัด FOC เสมอ (คำว่า FOC ใน PO Number / Reference)</li>
              <li>PO_number ที่แสดง = คอลัมน์ Reference ถ้าว่างใช้ PO Number</li>
              <li>Claim Rate % = จำนวนงานที่จับคู่กับ (PO, SKU) / จำนวนในบรรทัด PO ของ SKU นั้น × 100</li>
              <li>ยอดเสียหาย = ต้นทุนต่อหน่วยในบรรทัด PO × จำนวนงานที่จับคู่ (สมมติ 1 งาน = 1 เครื่อง)</li>
              <li>Payment Term ไม่มีใน API Zort จึงเว้นว่าง</li>
              <li>ดึงเฉพาะซัพพลายเออร์ต่างประเทศที่เป็น Co./Ltd/Limited/PTE/Corporation ตัด FOC, Test Supplier, Harvey, ชื่อว่าง</li>
            </ul>
          </CardContent>
        </Card>
      )}

      {dialogSku && (
        <ClaimCompensationDialog
          sku={dialogSku}
          model=""
          onClose={() => setDialogSku(null)}
          onSaved={() => setDialogSku(null)}
        />
      )}
    </div>
  );
}

function Kpi({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-semibold text-slate-900">{value}</div>
        {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}
