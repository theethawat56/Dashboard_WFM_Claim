"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatThaiNumber } from "@/lib/utils";

export interface ByModelRow {
  sku: string;
  model: string;
  total: number;
  repair_count: number;
  claim_count: number;
  reclaim_count: number;
  unfixed_count: number;
  risk_level?: "high" | "medium" | "low";
  top_issue_group?: string;
  peak_month?: string;
}

export interface CompSummaryBySku {
  total_amount: number;
  compensated_tasks: number;
}

export function ByModelTable({
  rows,
  onExportExcel,
  compBySku,
}: {
  rows: ByModelRow[];
  onExportExcel: (sku: string, dateFrom?: string, dateTo?: string) => void;
  compBySku?: Record<string, CompSummaryBySku>;
}) {
  const [dialogSku, setDialogSku] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  function openDialog(sku: string) {
    setDialogSku(sku);
    setDateFrom("");
    setDateTo("");
  }

  function closeDialog() {
    setDialogSku(null);
  }

  function handleConfirmExport() {
    if (!dialogSku) return;
    onExportExcel(dialogSku, dateFrom || undefined, dateTo || undefined);
    closeDialog();
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
        ไม่พบข้อมูลตามตัวกรอง
      </div>
    );
  }

  const riskLabel = (r: ByModelRow) =>
    r.risk_level === "high"
      ? "สูงมาก"
      : r.risk_level === "medium"
        ? "กลาง"
        : "ต่ำ";
  const riskVariant = (r: ByModelRow) =>
    r.risk_level === "high"
      ? "riskHigh"
      : r.risk_level === "medium"
        ? "riskMedium"
        : "riskLow";

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-700">SKU</th>
              <th className="px-4 py-3 font-medium text-slate-700">Model</th>
              <th className="px-4 py-3 font-medium text-slate-700">งานซ่อม</th>
              <th className="px-4 py-3 font-medium text-slate-700">งานเคลม</th>
              <th className="px-4 py-3 font-medium text-slate-700">รวม</th>
              <th className="px-4 py-3 font-medium text-slate-700">เคลมซ้ำ</th>
              <th className="px-4 py-3 font-medium text-slate-700">ซ่อมไม่หาย</th>
              <th className="px-4 py-3 font-medium text-slate-700">อาการหลัก</th>
              <th className="px-4 py-3 font-medium text-slate-700">เดือนที่มีปัญหามากสุด</th>
              <th className="px-4 py-3 font-medium text-slate-700">ความเสี่ยง</th>
              <th className="px-4 py-3 font-medium text-slate-700">ยอดเคลมได้ (฿)</th>
              <th className="px-4 py-3 font-medium text-slate-700">Export</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.sku}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-2 font-mono text-slate-800">{r.sku}</td>
                <td className="max-w-[160px] truncate px-4 py-2 text-slate-700">
                  {r.model || "-"}
                </td>
                <td className="px-4 py-2 text-slate-700">
                  {formatThaiNumber(r.repair_count)}
                </td>
                <td className="px-4 py-2 text-slate-700">
                  {formatThaiNumber(r.claim_count)}
                </td>
                <td className="px-4 py-2 font-medium text-slate-800">
                  {formatThaiNumber(r.total)}
                </td>
                <td className="px-4 py-2 text-slate-700">
                  {formatThaiNumber(r.reclaim_count)}
                </td>
                <td className="px-4 py-2 text-slate-700">
                  {formatThaiNumber(r.unfixed_count)}
                </td>
                <td className="max-w-[140px] truncate px-4 py-2 text-slate-600">
                  {r.top_issue_group ?? "-"}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {r.peak_month ?? "-"}
                </td>
                <td className="px-4 py-2">
                  <Badge
                    variant={
                      (riskVariant(r) as "riskHigh" | "riskMedium" | "riskLow") ??
                      "default"
                    }
                  >
                    {riskLabel(r)}
                  </Badge>
                </td>
                <td className="px-4 py-2">
                  {compBySku?.[r.sku] ? (
                    <div className="text-right">
                      <span className="font-medium text-green-700">
                        {formatThaiNumber(compBySku[r.sku].total_amount)}
                      </span>
                      <div className="text-[10px] text-slate-400">
                        {compBySku[r.sku].compensated_tasks}/{r.total} งาน
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">-</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openDialog(r.sku)}
                  >
                    Export Excel
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Export date-range dialog */}
      {dialogSku && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-base font-semibold text-slate-800">
              Export Excel
            </h3>
            <p className="mb-4 text-sm text-slate-500">
              SKU: <span className="font-mono font-medium text-slate-700">{dialogSku}</span>
            </p>

            <p className="mb-3 text-sm text-slate-600">
              เลือกช่วงเวลาที่ต้องการ Export (ไม่บังคับ — ถ้าไม่เลือกจะ Export ทั้งหมด)
            </p>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  จากวันที่
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  ถึงวันที่
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  min={dateFrom || undefined}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {dateFrom && dateTo && (
              <p className="mt-2 text-xs text-slate-500">
                Export เฉพาะงานที่สร้างระหว่าง {dateFrom} ถึง {dateTo}
              </p>
            )}
            {dateFrom && !dateTo && (
              <p className="mt-2 text-xs text-slate-500">
                Export เฉพาะงานที่สร้างตั้งแต่ {dateFrom} เป็นต้นไป
              </p>
            )}
            {!dateFrom && dateTo && (
              <p className="mt-2 text-xs text-slate-500">
                Export เฉพาะงานที่สร้างก่อน {dateTo}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={closeDialog}>
                ยกเลิก
              </Button>
              <Button size="sm" onClick={handleConfirmExport}>
                Export
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
