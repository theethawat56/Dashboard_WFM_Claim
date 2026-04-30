"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { DailyTrendRow } from "@/types/dashboard";

interface DailyChartPoint extends DailyTrendRow {
  repair_delta: number;
  claim_delta: number;
  total_delta: number;
}

function buildChartData(data: DailyTrendRow[]): DailyChartPoint[] {
  return data.map((row, i) => {
    const prev = data[i - 1];
    return {
      ...row,
      repair_delta: prev ? row.repair_count - prev.repair_count : 0,
      claim_delta: prev ? row.claim_count - prev.claim_count : 0,
      total_delta: prev ? row.total - prev.total : 0,
    };
  });
}

export function DailyTrendChart({
  data,
  days,
  onDaysChange,
}: {
  data: DailyTrendRow[] | null;
  days: number;
  onDaysChange: (d: number) => void;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
        ไม่มีข้อมูลแนวโน้มรายวัน
      </div>
    );
  }

  const chartData = buildChartData(data);

  const daysOptions = [
    { value: 7, label: "7 วัน" },
    { value: 14, label: "14 วัน" },
    { value: 30, label: "30 วัน" },
    { value: 60, label: "60 วัน" },
    { value: 90, label: "90 วัน" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-600">ช่วงเวลา:</span>
        {daysOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onDaysChange(opt.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              days === opt.value
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Main daily count chart */}
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="repairGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1976D2" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#1976D2" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="claimGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#E65100" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#E65100" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="reclaimGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#B71C1C" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#B71C1C" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => {
                const parts = String(v).split("-");
                return `${parts[2]}/${parts[1]}`;
              }}
              interval={days <= 14 ? 0 : "preserveStartEnd"}
              angle={days > 30 ? -45 : 0}
              textAnchor={days > 30 ? "end" : "middle"}
              height={days > 30 ? 50 : 30}
            />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  repair_count: "งานซ่อม",
                  claim_count: "งานเคลม",
                  reclaim_count: "เคลมซ้ำ",
                };
                return [value, labels[name] ?? name];
              }}
              labelFormatter={(label) => `วันที่ ${label}`}
            />
            <Legend
              formatter={(value) => {
                const labels: Record<string, string> = {
                  repair_count: "งานซ่อม",
                  claim_count: "งานเคลม",
                  reclaim_count: "เคลมซ้ำ",
                };
                return labels[value] ?? value;
              }}
            />
            <Area
              type="monotone"
              dataKey="repair_count"
              stroke="#1976D2"
              strokeWidth={2}
              fill="url(#repairGrad)"
              dot={days <= 14}
            />
            <Area
              type="monotone"
              dataKey="claim_count"
              stroke="#E65100"
              strokeWidth={2}
              fill="url(#claimGrad)"
              dot={days <= 14}
            />
            <Area
              type="monotone"
              dataKey="reclaim_count"
              stroke="#B71C1C"
              strokeWidth={2}
              fill="url(#reclaimGrad)"
              dot={days <= 14}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Delta (change) bar chart */}
      <p className="text-xs font-medium text-slate-500">
        การเปลี่ยนแปลงรายวัน (เทียบกับวันก่อนหน้า)
      </p>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData.slice(1)}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => {
                const parts = String(v).split("-");
                return `${parts[2]}/${parts[1]}`;
              }}
              interval={days <= 14 ? 0 : "preserveStartEnd"}
              angle={days > 30 ? -45 : 0}
              textAnchor={days > 30 ? "end" : "middle"}
              height={days > 30 ? 50 : 30}
            />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  repair_delta: "ซ่อม (เปลี่ยนแปลง)",
                  claim_delta: "เคลม (เปลี่ยนแปลง)",
                };
                const prefix = value > 0 ? "+" : "";
                return [`${prefix}${value}`, labels[name] ?? name];
              }}
              labelFormatter={(label) => `วันที่ ${label}`}
            />
            <Legend
              formatter={(value) => {
                const labels: Record<string, string> = {
                  repair_delta: "ซ่อม (เปลี่ยนแปลง)",
                  claim_delta: "เคลม (เปลี่ยนแปลง)",
                };
                return labels[value] ?? value;
              }}
            />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey="repair_delta"
              stroke="#1976D2"
              strokeWidth={1.5}
              fill="#1976D2"
              fillOpacity={0.15}
              dot={days <= 14}
            />
            <Area
              type="monotone"
              dataKey="claim_delta"
              stroke="#E65100"
              strokeWidth={1.5}
              fill="#E65100"
              fillOpacity={0.15}
              dot={days <= 14}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
