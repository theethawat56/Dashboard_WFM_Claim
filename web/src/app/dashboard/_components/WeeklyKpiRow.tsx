"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WeeklyKpiData {
  weekStart: string;
  weekEnd: string;
  cards: { label: string; current: number | null; previous: number | null; target: string; ok: boolean | null }[];
  cumulative: { date: string; actual: number; goal: number; stretch: number }[];
}

function show(value: number | null, suffix = ""): string {
  if (value == null) return "—";
  return `${value.toLocaleString("th-TH")}${suffix}`;
}

export function WeeklyKpiRow() {
  const [data, setData] = useState<WeeklyKpiData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/weekly-kpis")
      .then(async (response) => {
        if (!response.ok) throw new Error("โหลด KPI รายสัปดาห์ไม่สำเร็จ");
        return (await response.json()) as WeeklyKpiData;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "โหลด KPI รายสัปดาห์ไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>}
      <div className="grid gap-3 md:grid-cols-5">
        {(data?.cards ?? []).map((card) => (
          <Card key={card.label}>
            <CardContent className="px-3 py-3">
              <div className="text-xs text-slate-500">{card.label}</div>
              <div className={`mt-1 text-2xl font-semibold ${card.ok === false ? "text-red-700" : card.ok ? "text-emerald-700" : "text-slate-900"}`}>
                {show(card.current, card.label.startsWith("%") ? "%" : "")}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">สัปดาห์ก่อน {show(card.previous, card.label.startsWith("%") ? "%" : "")}</div>
              <div className="text-[11px] text-slate-500">เป้า {card.target}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">งานที่ได้ชดเชยสะสม เทียบเป้า 360 และ 460</CardTitle>
          <p className="text-sm text-slate-500">
            เริ่ม 26 พ.ย. 2026 ถึง 26 ม.ค. 2027 · สัปดาห์นี้ {data ? `${data.weekStart} – ${data.weekEnd}` : "—"}
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.cumulative ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="actual" name="ได้ชดเชยจริง" stroke="#059669" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="goal" name="เป้า 360" stroke="#d97706" dot={false} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="stretch" name="stretch 460" stroke="#7c3aed" dot={false} strokeDasharray="2 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
