"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bangkokDate } from "@/lib/bangkokDate";
import type { FactoryCompareData } from "@/types/dashboard";

function num(value: number): string {
  return value.toLocaleString("th-TH");
}

function rate(returned: number, pending: number): string {
  const total = returned + pending;
  if (total === 0) return "—";
  return `${((returned / total) * 100).toFixed(1)}%`;
}

function yearStart(): string {
  return `${bangkokDate().slice(0, 4)}-01-01`;
}

export function FactoryCompareCard() {
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(bangkokDate);
  const [data, setData] = useState<FactoryCompareData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const params = new URLSearchParams({ from, to });
    fetch(`/api/dashboard/factory-compare?${params}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("โหลดเปรียบเทียบโรงงานไม่สำเร็จ");
        return (await response.json()) as FactoryCompareData;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "โหลดเปรียบเทียบโรงงานไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const chartRows = useMemo(
    () =>
      (data?.rows ?? []).map((row) => ({
        name: row.shortName,
        pending: row.pending_clm + row.pending_mnt,
        returned: row.returned_clm + row.returned_mnt,
      })),
    [data]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">เปรียบเทียบโรงงาน: ค้างเคลม และเคลมกลับมาได้</CardTitle>
        <p className="mt-1 text-sm text-slate-500">
          เฉพาะ SKU โรงงานที่อยู่ในประกัน นับตามวันสร้างงานในช่วงที่เลือก ค้างที่ต้องไปเคลมคืองานที่ยังไม่บันทึกผลเคลม เคลมกลับมาได้คืองานที่บันทึกผลเคลมแล้ว
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>}
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-600">
            จากวันที่
            <input
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 block h-8 rounded-md border border-slate-300 px-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            ถึงวันที่
            <input
              type="date"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 block h-8 rounded-md border border-slate-300 px-2 text-sm"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat
            label="ค้างที่ต้องไปเคลม"
            clm={data ? num(data.pending_clm) : "—"}
            mnt={data ? num(data.pending_mnt) : "—"}
            tone="amber"
          />
          <Stat
            label="เคลมกลับมาได้"
            clm={data ? num(data.returned_clm) : "—"}
            mnt={data ? num(data.returned_mnt) : "—"}
            tone="green"
          />
        </div>
        {!data && !error ? (
          <p className="text-sm text-slate-500">กำลังโหลด...</p>
        ) : (
          <>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={48} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="pending" name="ค้างที่ต้องไปเคลม" fill="#d97706" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="returned" name="เคลมกลับมาได้" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 font-medium text-slate-700">โรงงาน</th>
                    <th className="px-3 py-2 text-right font-medium text-violet-800">CLM ค้าง</th>
                    <th className="px-3 py-2 text-right font-medium text-sky-800">MNT ค้าง</th>
                    <th className="px-3 py-2 text-right font-medium text-amber-800">รวมค้าง</th>
                    <th className="px-3 py-2 text-right font-medium text-violet-800">CLM กลับมา</th>
                    <th className="px-3 py-2 text-right font-medium text-sky-800">MNT กลับมา</th>
                    <th className="px-3 py-2 text-right font-medium text-emerald-800">รวมกลับมา</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-700">อัตรากลับมา</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows ?? []).map((row) => {
                    const pending = row.pending_clm + row.pending_mnt;
                    const returned = row.returned_clm + row.returned_mnt;
                    return (
                      <tr key={row.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-800" title={row.name}>
                          {row.shortName}
                        </td>
                        <td className="px-3 py-2 text-right">{num(row.pending_clm)}</td>
                        <td className="px-3 py-2 text-right">{num(row.pending_mnt)}</td>
                        <td className="px-3 py-2 text-right font-medium text-amber-800">{num(pending)}</td>
                        <td className="px-3 py-2 text-right">{num(row.returned_clm)}</td>
                        <td className="px-3 py-2 text-right">{num(row.returned_mnt)}</td>
                        <td className="px-3 py-2 text-right font-medium text-emerald-800">{num(returned)}</td>
                        <td className="px-3 py-2 text-right">{rate(returned, pending)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  clm,
  mnt,
  tone,
}: {
  label: string;
  clm: string;
  mnt: string;
  tone: "amber" | "green";
}) {
  const color = tone === "amber" ? "text-amber-700" : "text-emerald-700";
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <div>
          <div className="text-[11px] font-medium text-violet-700">CLM</div>
          <div className={`text-lg font-semibold ${color}`}>{clm}</div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-sky-700">MNT</div>
          <div className={`text-lg font-semibold ${color}`}>{mnt}</div>
        </div>
      </div>
    </div>
  );
}
