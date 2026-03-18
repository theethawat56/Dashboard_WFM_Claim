"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

export interface SymptomRow {
  issue_group: string;
  frequency: number;
  related_skus: string | null;
}

export function SymptomFrequencyChart({ data }: { data: SymptomRow[] | null }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
        ไม่มีข้อมูลอาการเสีย
      </div>
    );
  }

  const top15 = data.slice(0, 15);
  const avg = top15.length
    ? top15.reduce((s, d) => s + d.frequency, 0) / top15.length
    : 0;

  const withColor = top15.map((d) => ({
    ...d,
    name: d.issue_group.length > 40 ? d.issue_group.slice(0, 40) + "…" : d.issue_group,
    fill:
      d.frequency > avg
        ? "#B71C1C"
        : Math.abs(d.frequency - avg) < 0.01
          ? "#F57F17"
          : "#2E7D32",
  }));

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={withColor}
          layout="vertical"
          margin={{ top: 4, right: 20, left: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={180}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            formatter={(value: number) => [value, "ครั้ง"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="frequency" name="ความถี่" radius={[0, 4, 4, 0]}>
            {withColor.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
