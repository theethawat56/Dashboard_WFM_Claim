"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FactoryOpenMonthData } from "@/types/dashboard";

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function num(value: number): string {
  return value.toLocaleString("th-TH");
}

function monthLabel(month: string): string {
  const [year, raw] = month.split("-");
  const name = THAI_MONTHS[Number(raw) - 1] ?? month;
  return `${name} ${year}`;
}

export function FactoryOpenMonthCard() {
  const [data, setData] = useState<FactoryOpenMonthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch("/api/dashboard/factory-open-months")
      .then(async (response) => {
        if (!response.ok) throw new Error("โหลดงานตามเดือนไม่สำเร็จ");
        return (await response.json()) as FactoryOpenMonthData;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "โหลดงานตามเดือนไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    const refresh = () => setReloadKey((value) => value + 1);
    window.addEventListener("factory-submission-changed", refresh);
    return () => window.removeEventListener("factory-submission-changed", refresh);
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">งานโรงงานตามเดือนที่เปิดงาน</CardTitle>
        <p className="mt-1 text-sm text-slate-500">
          เฉพาะงานปีนี้ของ SKU โรงงานที่อยู่ในประกัน นับตามวันสร้างงาน ยังไม่ส่งคืองานที่ยังไม่เข้าลิงก์โรงงานและยังไม่บันทึกผลเคลม ส่วนส่งแล้วคืองานที่อยู่ในลิงก์โรงงานหรือบันทึกผลเคลมแล้ว
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label="ยังไม่ส่ง" clm={data ? num(data.not_sent_clm) : "—"} mnt={data ? num(data.not_sent_mnt) : "—"} />
          <Stat label="ส่งแล้ว" clm={data ? num(data.sent_clm) : "—"} mnt={data ? num(data.sent_mnt) : "—"} />
        </div>
        {!data && !error ? (
          <p className="text-sm text-slate-500">กำลังโหลด...</p>
        ) : (
          <div className="overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 font-medium text-slate-700">เดือนที่เปิดงาน</th>
                  <th className="px-3 py-2 text-right font-medium text-violet-800">CLM ยังไม่ส่ง</th>
                  <th className="px-3 py-2 text-right font-medium text-violet-800">CLM ส่งแล้ว</th>
                  <th className="px-3 py-2 text-right font-medium text-sky-800">MNT ยังไม่ส่ง</th>
                  <th className="px-3 py-2 text-right font-medium text-sky-800">MNT ส่งแล้ว</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((row) => (
                  <tr key={row.month} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-slate-800">{monthLabel(row.month)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{num(row.not_sent_clm)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{num(row.sent_clm)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{num(row.not_sent_mnt)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{num(row.sent_mnt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, clm, mnt }: { label: string; clm: string; mnt: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <div>
          <div className="text-[11px] font-medium text-violet-700">CLM</div>
          <div className="text-lg font-semibold text-slate-900">{clm}</div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-sky-700">MNT</div>
          <div className="text-lg font-semibold text-slate-900">{mnt}</div>
        </div>
      </div>
    </div>
  );
}
