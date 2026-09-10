"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClaimCompensationDialog } from "./ClaimCompensationDialog";
import type { ClaimTrackingData, ClaimTrackingRow, WarrantyBucket } from "@/types/dashboard";

type ViewFilter = "all" | WarrantyBucket | "missing_serial" | "missing_symptom" | "closed" | "open";

function bangkokMonth(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).slice(0, 7);
}

function money(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function num(n: number): string {
  return n.toLocaleString("th-TH");
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
}

export function ClaimTrackingTab() {
  const [month, setMonth] = useState(bangkokMonth);
  const [data, setData] = useState<ClaimTrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewFilter>("all");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ sku: string; model: string; task: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/claim-tracking?month=${encodeURIComponent(month)}`);
      if (!res.ok) throw new Error("โหลดงานเคลมไม่สำเร็จ");
      setData((await res.json()) as ClaimTrackingData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    const needle = search.trim().toLowerCase();
    return list.filter((r) => {
      if (view === "in" && r.warranty_bucket !== "in") return false;
      if (view === "out" && r.warranty_bucket !== "out") return false;
      if (view === "unknown" && r.warranty_bucket !== "unknown") return false;
      if (view === "missing_serial" && !r.missing_serial) return false;
      if (view === "missing_symptom" && !r.missing_symptom) return false;
      if (view === "closed" && !r.is_closed) return false;
      if (view === "open" && r.is_closed) return false;
      if (!needle) return true;
      return (
        r.task_number.toLowerCase().includes(needle) ||
        (r.sku ?? "").toLowerCase().includes(needle) ||
        (r.product_name ?? "").toLowerCase().includes(needle) ||
        (r.product_serial ?? "").toLowerCase().includes(needle)
      );
    });
  }, [data, view, search]);

  const kpis = data?.kpis;
  const months = data?.months ?? [month];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">ตามเคลมรายเดือน</h2>
          <p className="text-sm text-slate-500">
            ดูเฉพาะงานเคลมเดือนที่เลือก · ในประกัน = ไม่เกิน 365 วันจากวันลงทะเบียน (รวมวันที่ติดลบ)
          </p>
        </div>
        <label className="text-sm text-slate-600">
          เดือน
          <input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setView("all");
            }}
            className="ml-2 h-8 rounded-md border border-slate-300 px-2 text-sm"
            list="claim-tracking-months"
          />
          <datalist id="claim-tracking-months">
            {months.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi title="งานเคลมเดือนนี้" value={kpis ? num(kpis.total) : "—"} hint={monthLabel(month)} />
        <Kpi title="อยู่ในประกัน" value={kpis ? num(kpis.in_warranty) : "—"} hint="≤ 365 วัน / รวมวันติดลบ" />
        <Kpi title="นอกประกัน" value={kpis ? num(kpis.out_warranty) : "—"} hint={kpis ? `ไม่มีวันประกัน ${num(kpis.unknown_warranty)}` : ""} />
        <Kpi title="ปิดงานแล้ว" value={kpis ? num(kpis.closed) : "—"} hint={kpis ? `ยังเปิด ${num(kpis.total - kpis.closed)}` : ""} />
        <Kpi title="เคลมโรงงานแล้ว" value={kpis ? num(kpis.factory_recorded) : "—"} hint="บันทึกผลเคลมแล้ว" />
        <Kpi
          title="มูลค่าเคลมเดือนนี้"
          value={kpis ? money(kpis.month_value) : "—"}
          hint={kpis ? `ต้นทุน PO · บันทึกแล้ว ${money(kpis.recorded_value)}` : "บาท"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", `ทั้งหมด (${kpis?.total ?? 0})`],
            ["in", `ในประกัน (${kpis?.in_warranty ?? 0})`],
            ["out", `นอกประกัน (${kpis?.out_warranty ?? 0})`],
            ["unknown", `ไม่มีวันประกัน (${kpis?.unknown_warranty ?? 0})`],
            ["closed", `ปิดงาน (${kpis?.closed ?? 0})`],
            ["open", `ยังเปิด (${kpis ? kpis.total - kpis.closed : 0})`],
            ["missing_serial", `ไม่มี S/N (${kpis?.missing_serial ?? 0})`],
            ["missing_symptom", `ไม่มีอาการ (${kpis?.missing_symptom ?? 0})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              view === id ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
        <input
          type="text"
          placeholder="ค้นหาเลขงาน / SKU / S/N"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto h-8 w-64 rounded-md border border-slate-300 px-3 text-sm"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            รายการเคลม {monthLabel(month)} · {num(rows.length)} งาน
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 font-medium">เลขงาน</th>
                  <th className="px-3 py-2 font-medium">สินค้า</th>
                  <th className="px-3 py-2 font-medium">S/N</th>
                  <th className="px-3 py-2 font-medium">อาการเสีย</th>
                  <th className="px-3 py-2 font-medium">วันสร้าง</th>
                  <th className="px-3 py-2 font-medium">วันลงทะเบียน</th>
                  <th className="px-3 py-2 font-medium text-right">อายุ (วัน)</th>
                  <th className="px-3 py-2 font-medium">ประกัน</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                  <th className="px-3 py-2 font-medium">โรงงาน</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-slate-400">
                      กำลังโหลด...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-slate-400">
                      ไม่มีงานเคลมในมุมมองนี้
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <ClaimRow
                      key={r.id}
                      row={r}
                      onRecord={() =>
                        r.sku &&
                        setDialog({
                          sku: r.sku,
                          model: r.product_name ?? "",
                          task: r.task_number,
                        })
                      }
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {dialog && (
        <ClaimCompensationDialog
          sku={dialog.sku}
          model={dialog.model}
          preSelectTaskNumber={dialog.task}
          onClose={() => setDialog(null)}
          onSaved={() => {
            load().catch(() => undefined);
          }}
        />
      )}
    </div>
  );
}

function ClaimRow({ row, onRecord }: { row: ClaimTrackingRow; onRecord: () => void }) {
  const symptom = (row.issue_group || row.issue_description || "").trim();
  return (
    <tr className="border-b border-slate-100">
      <td className="px-3 py-2 font-mono text-xs">{row.task_number}</td>
      <td className="max-w-[200px] px-3 py-2 text-xs" title={row.sku ?? undefined}>
        {row.product_name || "—"}
      </td>
      <td className={`px-3 py-2 font-mono text-xs ${row.missing_serial ? "font-medium text-red-600" : ""}`}>
        {row.missing_serial ? "ไม่มี S/N" : row.product_serial}
      </td>
      <td
        className={`max-w-[240px] px-3 py-2 text-xs ${row.missing_symptom ? "font-medium text-red-600" : ""}`}
        title={symptom || undefined}
      >
        {row.missing_symptom ? "ไม่มีอาการเสีย" : symptom}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs">{row.create_date ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-2 text-xs">{row.warranty_start_date ?? "—"}</td>
      <td className="px-3 py-2 text-right text-xs">
        {row.days_from_register != null ? num(row.days_from_register) : "—"}
      </td>
      <td className="px-3 py-2">
        <WarrantyBadge bucket={row.warranty_bucket} />
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${
            row.is_closed
              ? "border-slate-200 bg-slate-100 text-slate-700"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {row.is_closed ? "ปิดงาน" : "ยังเปิด"}
        </span>
      </td>
      <td className="px-3 py-2 text-xs">
        {row.factory_recorded ? (
          <span className="text-emerald-700">บันทึกแล้ว{row.recorded_amount != null ? ` ${money(row.recorded_amount)}` : ""}</span>
        ) : (
          <span className="text-slate-400">ยังไม่บันทึก</span>
        )}
      </td>
      <td className="px-3 py-2">
        <Button variant="outline" className="h-7 px-2 text-xs" disabled={!row.sku} onClick={onRecord}>
          บันทึกเคลม
        </Button>
      </td>
    </tr>
  );
}

function WarrantyBadge({ bucket }: { bucket: WarrantyBucket }) {
  if (bucket === "in") {
    return (
      <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
        ในประกัน
      </span>
    );
  }
  if (bucket === "out") {
    return (
      <span className="inline-flex rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs text-orange-800">
        นอกประกัน
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
      ไม่มีวันประกัน
    </span>
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
