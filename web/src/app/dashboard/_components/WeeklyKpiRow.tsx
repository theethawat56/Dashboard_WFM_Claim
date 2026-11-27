"use client";

import { useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PaceTarget {
  done: number;
  target: number;
}

interface WeeklyKpiData {
  weekStart: string;
  weekEnd: string;
  cards: { label: string; current: number | null; previous: number | null; target: string; ok: boolean | null }[];
  pace: {
    workingDaysLeft: number;
    isWorkingDay: boolean;
    goal: PaceTarget;
    stretch: PaceTarget;
    waiting: number;
    acceptPercent: number;
    action: "send" | "hurry";
    sendMore: number;
    hurryFactory: string | null;
  };
  cumulative: { date: string; daily: number; actual: number; goal: number; stretch: number }[];
}

function show(value: number | null, suffix = ""): string {
  if (value == null) return "—";
  return `${value.toLocaleString("th-TH")}${suffix}`;
}

function PaceBar({ label, done, target }: { label: string; done: number; target: number }) {
  const width = target <= 0 ? (done > 0 ? 100 : 0) : Math.min(100, (done / target) * 100);
  const met = target > 0 && done >= target;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-900">
          ได้แล้ว {done.toLocaleString("th-TH")} / เป้า {target.toLocaleString("th-TH")}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${met ? "bg-emerald-600" : "bg-amber-500"}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
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
          <CardTitle className="text-base">วันนี้ต้องได้ชดเชย</CardTitle>
          <p className="text-sm text-slate-500">
            {data
              ? `เหลือวันทำงาน ${data.pace.workingDaysLeft.toLocaleString("th-TH")} วัน${data.pace.isWorkingDay ? "" : " · วันนี้ไม่ใช่วันทำงาน"}`
              : "กำลังโหลด..."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <PaceBar label="สู่เป้า 360" done={data?.pace.goal.done ?? 0} target={data?.pace.goal.target ?? 0} />
          <PaceBar label="สู่เป้า 460" done={data?.pace.stretch.done ?? 0} target={data?.pace.stretch.target ?? 0} />
          <div className="border-t border-slate-100 pt-3 text-sm text-slate-700">
            <div className="text-slate-500">งานที่รอโรงงานตอบพอไหม</div>
            <div className="mt-1 font-medium text-slate-900">
              {data?.pace.action === "send"
                ? `ต้องส่งเพิ่มอย่างน้อย ${(data.pace.sendMore).toLocaleString("th-TH")} งาน`
                : `เร่งโรงงาน${data?.pace.hurryFactory ? ` ${data.pace.hurryFactory}` : ""}`}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              รอตอบ {(data?.pace.waiting ?? 0).toLocaleString("th-TH")} งาน × ยอมรับ {data ? `${data.pace.acceptPercent.toLocaleString("th-TH")}%` : "—"}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">งานที่ได้ชดเชยสะสม เทียบเป้า 360 และ 460</CardTitle>
          <p className="text-sm text-slate-500">
            เริ่ม 26 พ.ย. 2026 ถึง 26 ม.ค. 2027 · แท่งคือรายวัน เส้นทึบคือยอดสะสม เส้นประคือยอดสะสมที่ควรถึงตามวันทำงาน
            {data ? ` · สัปดาห์นี้ ${data.weekStart} – ${data.weekEnd}` : ""}
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data?.cumulative ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="cum" tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
                <YAxis yAxisId="day" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} width={32} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="day" dataKey="daily" name="ได้ชดเชยรายวัน" fill="#6ee7b7" radius={[2, 2, 0, 0]} />
                <Line yAxisId="cum" type="monotone" dataKey="actual" name="ยอดสะสม" stroke="#059669" dot={false} strokeWidth={2} />
                <Line yAxisId="cum" type="monotone" dataKey="goal" name="สะสมที่ควรถึง 360" stroke="#d97706" dot={false} strokeDasharray="4 3" />
                <Line yAxisId="cum" type="monotone" dataKey="stretch" name="สะสมที่ควรถึง 460" stroke="#7c3aed" dot={false} strokeDasharray="2 3" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
