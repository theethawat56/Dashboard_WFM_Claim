"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { recentMonths } from "@/lib/bangkokDate";
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
  claim_trend?: number[];
}

export interface CompSummaryBySku {
  total_amount: number;
  compensated_tasks: number;
}

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function ClaimSpark({ values }: { values: number[] }) {
  const series = values.length === 6 ? values : [0, 0, 0, 0, 0, 0];
  const months = recentMonths(6);
  const width = 92;
  const height = 28;
  const pad = 3;
  const max = Math.max(1, ...series);
  const points = series
    .map((value, index) => {
      const x = pad + (index * (width - pad * 2)) / (series.length - 1);
      const y = height - pad - (value / max) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");
  const first = series[0] ?? 0;
  const last = series[series.length - 1] ?? 0;
  const color = last < first ? "#059669" : last > first ? "#dc2626" : "#64748b";
  const title = series
    .map((value, index) => {
      const month = Number(months[index]?.slice(5, 7));
      return `${THAI_MONTHS[month - 1] ?? months[index]} ${value}`;
    })
    .join(" · ");
  return (
    <span className="inline-flex items-center gap-2" title={title}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <polyline fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" points={points} />
      </svg>
      <span className="w-6 text-right text-xs tabular-nums text-slate-600">{formatThaiNumber(last)}</span>
    </span>
  );
}

type DialogMode = "excel" | "video";

type ZipPartLink = {
  id: number;
  kind: "zip" | "file";
  fileCount: number;
  bytes: number;
  name: string;
  href: string;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "ไม่ทราบขนาด";
  const mb = bytes / (1024 * 1024);
  if (mb >= 10) return `${formatThaiNumber(Math.round(mb))} MB`;
  return `${mb.toFixed(1)} MB`;
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
  const [dialogMode, setDialogMode] = useState<DialogMode>("excel");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [videoBusy, setVideoBusy] = useState<"xlsx" | "count" | null>(null);
  const [videoError, setVideoError] = useState("");
  const [zipReady, setZipReady] = useState<{
    fileCount: number;
    taskCount: number;
    parts: ZipPartLink[];
  } | null>(null);

  function openDialog(sku: string, mode: DialogMode) {
    setDialogSku(sku);
    setDialogMode(mode);
    setDateFrom("");
    setDateTo("");
    setVideoError("");
    setZipReady(null);
    setVideoBusy(null);
  }

  function closeDialog() {
    setDialogSku(null);
    setVideoBusy(null);
  }

  function mediaParams(format: "xlsx" | "zip" | "count" | "plan", part?: number, planId?: string) {
    const params = new URLSearchParams({ sku: dialogSku ?? "", format });
    if (part != null) params.set("part", String(part));
    if (planId) params.set("planId", planId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params;
  }

  function handleConfirmExport() {
    if (!dialogSku) return;
    onExportExcel(dialogSku, dateFrom || undefined, dateTo || undefined);
    closeDialog();
  }

  async function downloadVideoExcel() {
    if (!dialogSku) return;
    setVideoBusy("xlsx");
    setVideoError("");
    try {
      const res = await fetch(`/api/export/media?${mediaParams("xlsx")}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setVideoError(data?.error || "Export ไม่สำเร็จ");
        return;
      }
      const blob = await res.blob();
      const header = res.headers.get("Content-Disposition") ?? "";
      const encoded = /filename\*=UTF-8''([^;]+)/.exec(header)?.[1];
      const plain = /filename="([^"]+)"/.exec(header)?.[1];
      const filename = encoded ? decodeURIComponent(encoded) : plain || "videos.xlsx";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      closeDialog();
    } catch {
      setVideoError("Export ไม่สำเร็จ");
    } finally {
      setVideoBusy(null);
    }
  }

  async function prepareZip() {
    if (!dialogSku) return;
    setVideoBusy("count");
    setVideoError("");
    setZipReady(null);
    try {
      const res = await fetch(`/api/export/media?${mediaParams("plan")}`);
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        planId?: string;
        fileCount?: number;
        taskCount?: number;
        parts?: Array<{
          id: number;
          kind: "zip" | "file";
          fileCount: number;
          bytes: number;
          name: string;
          objectKey?: string;
        }>;
      } | null;
      if (!res.ok || !data?.fileCount || !data.parts?.length) {
        setVideoError(data?.error || "ไม่พบไฟล์ให้ดาวน์โหลด");
        return;
      }
      setZipReady({
        fileCount: data.fileCount,
        taskCount: data.taskCount ?? 0,
        parts: data.parts.map((part) => ({
          id: part.id,
          kind: part.kind,
          fileCount: part.fileCount,
          bytes: part.bytes,
          name: part.name,
          href:
            part.kind === "file"
              ? `/api/export/media/file?objectKey=${encodeURIComponent(part.objectKey ?? "")}`
              : `/api/export/media?${mediaParams("zip", part.id, data.planId)}`,
        })),
      });
    } catch {
      setVideoError("ตรวจสอบไฟล์ไม่สำเร็จ");
    } finally {
      setVideoBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
        ไม่พบข้อมูลตามตัวกรอง
      </div>
    );
  }

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
              <th className="px-4 py-3 font-medium text-slate-700" title="งานเคลมที่เปิดใน 6 เดือนล่าสุด เส้นเขียวคือเดือนล่าสุดน้อยกว่าเดือนแรก">
                เคลม 6 เดือน
              </th>
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
                  <ClaimSpark values={r.claim_trend ?? []} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Export date-range dialog */}
      {dialogSku && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-base font-semibold text-slate-800">
              {dialogMode === "video" ? "Export วิดีโอและรูป" : "Export Excel"}
            </h3>
            <p className="mb-4 text-sm text-slate-500">
              SKU: <span className="font-mono font-medium text-slate-700">{dialogSku}</span>
            </p>

            <p className="mb-3 text-sm text-slate-600">
              {dialogMode === "video"
                ? "รวมวิดีโอทดสอบ วิดีโอจากช่าง และรูป ของทุกงานใน SKU นี้ ทั้งเลข MNT และ CLM เลือกช่วงเวลาได้ (ไม่บังคับ)"
                : "เลือกช่วงเวลาที่ต้องการ Export (ไม่บังคับ — ถ้าไม่เลือกจะ Export ทั้งหมด)"}
            </p>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  จากวันที่
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setZipReady(null);
                  }}
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
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setZipReady(null);
                  }}
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

            {videoError && (
              <p className="mt-3 text-sm text-red-600">{videoError}</p>
            )}
            {zipReady && dialogMode === "video" && (
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <p>
                  พบ {formatThaiNumber(zipReady.fileCount)} ไฟล์ จาก {formatThaiNumber(zipReady.taskCount)} งาน
                  แยกเป็น {formatThaiNumber(zipReady.parts.length)} ส่วน แต่ละ ZIP ไม่เกิน 800 MB ไฟล์ที่ใหญ่กว่านั้นดาวน์โหลดแยกทั้งก้อน
                </p>
                <ul className="max-h-48 space-y-2 overflow-y-auto">
                  {zipReady.parts.map((part) => (
                    <li key={`${part.kind}-${part.id}`} className="flex items-center justify-between gap-3">
                      <span>
                        {part.kind === "zip"
                          ? `ZIP ส่วนที่ ${formatThaiNumber(part.id)} · ${formatThaiNumber(part.fileCount)} ไฟล์`
                          : part.name}
                        {" · "}
                        {formatBytes(part.bytes)}
                      </span>
                      <a
                        href={part.href}
                        className="inline-flex h-8 shrink-0 items-center rounded-md bg-[#1565C0] px-3 text-sm font-medium text-white hover:bg-[#0D47A1]"
                      >
                        ดาวน์โหลด
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" onClick={closeDialog} disabled={videoBusy != null}>
                ยกเลิก
              </Button>
              {dialogMode === "excel" ? (
                <Button size="sm" onClick={handleConfirmExport}>
                  Export
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={downloadVideoExcel} disabled={videoBusy != null}>
                    {videoBusy === "xlsx" ? "กำลังสร้าง Excel..." : "Excel ลิงก์"}
                  </Button>
                  {!zipReady && (
                    <Button size="sm" onClick={prepareZip} disabled={videoBusy != null}>
                      {videoBusy === "count" ? "กำลังวัดขนาดไฟล์..." : "เตรียม ZIP"}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
