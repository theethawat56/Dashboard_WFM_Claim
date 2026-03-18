"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

export function DonutChartRepairClaim({
  repairCount,
  claimCount,
  reclaimCount,
}: {
  repairCount: number;
  claimCount: number;
  reclaimCount: number;
}) {
  const data: DonutSlice[] = [
    { name: "งานซ่อม", value: repairCount, color: "#1976D2" },
    { name: "งานเคลม", value: claimCount - reclaimCount, color: "#E65100" },
    { name: "เคลมซ้ำ", value: reclaimCount, color: "#B71C1C" },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
        ไม่มีข้อมูล
      </div>
    );
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            label={({ name, value }) => `${name}: ${value}`}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => [value, ""]} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
