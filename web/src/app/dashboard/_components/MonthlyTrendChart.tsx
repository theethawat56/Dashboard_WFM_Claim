"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export interface TrendPoint {
  month: string;
  repair_count: number;
  claim_count: number;
  reclaim_count: number;
  total: number;
}

export function MonthlyTrendChart({ data }: { data: TrendPoint[] | null }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
        ไม่มีข้อมูลแนวโน้มรายเดือน
      </div>
    );
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12 }}
            tickFormatter={(v) => {
              const [y, m] = String(v).split("-");
              return `${m}/${y}`;
            }}
          />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip
            formatter={(value: number) => [value, ""]}
            labelFormatter={(label) => `เดือน ${label}`}
          />
          <Legend />
          <Bar dataKey="repair_count" name="งานซ่อม" stackId="a" fill="#1976D2" />
          <Bar dataKey="claim_count" name="งานเคลม" stackId="a" fill="#E65100" />
          <Bar dataKey="reclaim_count" name="เคลมซ้ำ" stackId="a" fill="#B71C1C" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
