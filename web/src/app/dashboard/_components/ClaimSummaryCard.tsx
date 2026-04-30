"use client";

import type { ClaimCompOverall } from "@/types/dashboard";

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  cost_refund: { label: "ต้นทุนคืน", color: "text-blue-700" },
  spare_parts: { label: "อะไหล่", color: "text-orange-700" },
  deduce: { label: "Deduce", color: "text-purple-700" },
  replacement: { label: "สินค้าใหม่", color: "text-green-700" },
};

export function ClaimSummaryCard({ data }: { data: ClaimCompOverall | null }) {
  if (!data) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        กำลังโหลดข้อมูลเคลม...
      </div>
    );
  }

  const uncompensated =
    data.total_claim_task_count - data.compensated_task_count;
  const fmt = (n: number) => n.toLocaleString("th-TH");

  const typeBreakdown = [
    { key: "cost_refund", amount: data.cost_refund },
    { key: "spare_parts", amount: data.spare_parts },
    { key: "deduce", amount: data.deduce },
    { key: "replacement", amount: data.replacement },
  ];

  return (
    <div className="space-y-4">
      {/* Main KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
          <div className="text-2xl font-bold text-slate-800">
            {fmt(data.total_amount)}
          </div>
          <div className="text-xs text-slate-500">ยอดเคลมรวม (บาท)</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
          <div className="text-2xl font-bold text-green-700">
            {fmt(data.compensated_task_count)}
          </div>
          <div className="text-xs text-slate-500">งานที่ได้ชดเชยแล้ว</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
          <div className="text-2xl font-bold text-red-600">
            {fmt(uncompensated < 0 ? 0 : uncompensated)}
          </div>
          <div className="text-xs text-slate-500">งานเคลมที่ยังไม่ได้ชดเชย</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
          <div className="text-2xl font-bold text-slate-800">
            {fmt(data.total_claim_task_count)}
          </div>
          <div className="text-xs text-slate-500">งานเคลมทั้งหมด</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Type breakdown */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-3 text-sm font-medium text-slate-700">
            แยกตามประเภทชดเชย
          </p>
          <div className="space-y-2">
            {typeBreakdown.map(({ key, amount }) => {
              const info = TYPE_LABELS[key];
              const pct =
                data.total_amount > 0
                  ? (amount / data.total_amount) * 100
                  : 0;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{info.label}</span>
                    <span className={`font-medium ${info.color}`}>
                      {fmt(amount)} ฿
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full bg-blue-500"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top 5 SKUs */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-3 text-sm font-medium text-slate-700">
            Top 5 SKU ที่เคลมได้มากที่สุด
          </p>
          {data.top_skus.length === 0 ? (
            <p className="text-sm text-slate-400">ยังไม่มีข้อมูล</p>
          ) : (
            <div className="space-y-2">
              {data.top_skus.map((s, i) => (
                <div
                  key={s.sku}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                      {i + 1}
                    </span>
                    <span className="font-mono text-slate-700">{s.sku}</span>
                    {s.model && (
                      <span className="text-xs text-slate-400">{s.model}</span>
                    )}
                  </div>
                  <span className="font-medium text-green-700">
                    {fmt(s.total_amount)} ฿
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
