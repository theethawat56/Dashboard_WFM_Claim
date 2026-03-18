"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface ModelStat {
  sku: string;
  model: string;
  total: number;
  repair_count: number;
  claim_count: number;
  reclaim_count?: number;
}

export function ModelBreakdownTable({ data }: { data: ModelStat[] | null }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
        ไม่มีข้อมูลแยกตามรุ่น
      </div>
    );
  }

  const top10 = data.slice(0, 10).map((d) => ({
    name: d.model?.slice(0, 24) || d.sku?.slice(0, 24) || "-",
    total: d.total,
    repair: d.repair_count,
    claim: d.claim_count,
  }));

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={top10} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value: number) => [value, ""]} />
          <Bar dataKey="total" name="รวม (ซ่อม+เคลม)" fill="#1565C0" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
