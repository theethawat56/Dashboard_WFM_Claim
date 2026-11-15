"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { FactoryClaimQueueData, FactoryClaimQueueRow } from "@/types/dashboard";

type QueueFilter = "all" | "ready" | "blocked";

function num(n: number): string {
  return n.toLocaleString("th-TH");
}

export function FactoryClaimQueueCard({ onOpenTracking }: { onOpenTracking?: () => void }) {
  const [data, setData] = useState<FactoryClaimQueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/dashboard/factory-queue")
      .then(async (res) => {
        if (!res.ok) throw new Error("โหลดคิวเคลมโรงงานไม่สำเร็จ");
        return (await res.json()) as FactoryClaimQueueData;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "โหลดคิวเคลมโรงงานไม่สำเร็จ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    if (filter === "ready") return list.filter((r) => r.ready);
    if (filter === "blocked") return list.filter((r) => !r.ready);
    return list;
  }, [data, filter]);

  const totalEligible = (data?.pending_count ?? 0) + (data?.claimed_count ?? 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">งานที่ต้องไปเคลมโรงงาน</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              เฉพาะ SKU โรงงานที่ยังอยู่ในประกัน และยังไม่บันทึกผลเคลม เรียงจากงานที่อายุประกันใกล้ครบก่อน
            </p>
          </div>
          {onOpenTracking && (
            <Button type="button" variant="outline" size="sm" onClick={onOpenTracking}>
              เปิดแท็บตามเคลม
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="ยังต้องเคลม" value={data ? num(data.pending_count) : "—"} tone="amber" hint="ยังไม่บันทึกผลเคลม" />
          <Stat label="เคลมไปแล้ว" value={data ? num(data.claimed_count) : "—"} tone="green" hint={data ? `จาก ${num(totalEligible)} งานในประกัน` : "บันทึกผลเคลมแล้ว"} />
          <Stat label="พร้อมส่ง" value={data ? num(data.ready_count) : "—"} tone="slate" hint="มี S/N และอาการเสีย" />
          <Stat label="ยังขาดข้อมูล" value={data ? num(data.blocked_count) : "—"} tone="red" hint="ไม่มี S/N หรือไม่มีอาการ" />
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "ทั้งหมดที่ต้องทำ"],
              ["ready", "พร้อมส่ง"],
              ["blocked", "ยังขาดข้อมูล"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                filter === id ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-3 py-2 font-medium text-slate-700">เลขงาน</th>
                <th className="px-3 py-2 font-medium text-slate-700">ประเภท</th>
                <th className="px-3 py-2 font-medium text-slate-700">สินค้า</th>
                <th className="px-3 py-2 font-medium text-slate-700">S/N</th>
                <th className="px-3 py-2 font-medium text-slate-700">อาการเสีย</th>
                <th className="px-3 py-2 text-right font-medium text-slate-700">อายุ (วัน)</th>
                <th className="px-3 py-2 font-medium text-slate-700">ความพร้อม</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                    กำลังโหลด...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                    {data && data.pending_count === 0 ? "ไม่มีงานค้างเคลมโรงงานในช่วงประกัน" : "ไม่มีงานในมุมมองนี้"}
                  </td>
                </tr>
              ) : (
                rows.map((row) => <QueueRow key={row.id} row={row} />)
              )}
            </tbody>
          </table>
        </div>
        {data && data.pending_count > data.shown && (
          <p className="text-xs text-slate-500">
            ตารางแสดง {num(data.shown)} รายการที่อายุประกันใกล้ครบที่สุด จาก {num(data.pending_count)} รายการที่ยังต้องเคลม
            {filter === "ready" ? ` · ในชุดนี้พร้อมส่ง ${num(rows.length)} รายการ` : ""}
            {filter === "blocked"
              ? ` · ในชุดนี้ขาดข้อมูล ${num(rows.length)} รายการ จากทั้งคิว ${num(data.blocked_count)} รายการ`
              : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function QueueRow({ row }: { row: FactoryClaimQueueRow }) {
  const gap = row.missing_serial && row.missing_symptom
    ? "ขาด S/N และอาการ"
    : row.missing_serial
      ? "ขาด S/N"
      : row.missing_symptom
        ? "ขาดอาการ"
        : "พร้อมส่ง";
  return (
    <tr className="border-b border-slate-100">
      <td className="px-3 py-2 font-mono text-xs text-slate-800">{row.task_number}</td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${
            row.task_type === "claim"
              ? "border-violet-200 bg-violet-50 text-violet-800"
              : "border-sky-200 bg-sky-50 text-sky-800"
          }`}
        >
          {row.task_type === "claim" ? "เคลม" : "ซ่อม"}
        </span>
      </td>
      <td className="max-w-[180px] truncate px-3 py-2 text-xs text-slate-700" title={row.sku ?? undefined}>
        {row.product_name || "—"}
      </td>
      <td className={`px-3 py-2 font-mono text-xs ${row.missing_serial ? "font-medium text-red-600" : "text-slate-700"}`}>
        {row.missing_serial ? "ไม่มี S/N" : row.product_serial}
      </td>
      <td className={`max-w-[220px] truncate px-3 py-2 text-xs ${row.missing_symptom ? "font-medium text-red-600" : "text-slate-600"}`}>
        {row.missing_symptom ? "ไม่มีอาการเสีย" : row.issue}
      </td>
      <td className="px-3 py-2 text-right text-xs text-slate-700">
        {row.days_from_register != null ? num(row.days_from_register) : "—"}
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${
            row.ready
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {gap}
          {row.is_closed ? "" : " · ยังเปิด"}
        </span>
      </td>
    </tr>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "amber" | "green" | "slate" | "red";
}) {
  const color =
    tone === "amber"
      ? "text-amber-700"
      : tone === "green"
        ? "text-emerald-700"
        : tone === "red"
          ? "text-red-600"
          : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      <div className="text-sm font-medium text-slate-800">{label}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}
