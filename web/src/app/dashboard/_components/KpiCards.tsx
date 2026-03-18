"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatThaiNumber, formatDateThai } from "@/lib/utils";

export interface SummaryData {
  total: number;
  repair_count: number;
  claim_count: number;
  reclaim_count: number;
  unfixed_count: number;
  unique_sku_count: number;
  latest_sync_at: string | null;
}

export function KpiCards({ data }: { data: SummaryData | null }) {
  if (!data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 w-24 rounded bg-slate-200" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 rounded bg-slate-200" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const reclaimPct =
    data.total > 0 ? ((data.reclaim_count / data.total) * 100).toFixed(1) : "0";

  const cards = [
    {
      title: "งานทั้งหมด",
      value: formatThaiNumber(data.total),
      sub: null,
    },
    {
      title: "งานซ่อม / งานเคลม",
      value: `${formatThaiNumber(data.repair_count)} / ${formatThaiNumber(data.claim_count)}`,
      sub: null,
    },
    {
      title: "เคลมซ้ำ",
      value: formatThaiNumber(data.reclaim_count),
      sub: `(${reclaimPct}%)`,
    },
    {
      title: "ซ่อมแล้วไม่หาย",
      value: formatThaiNumber(data.unfixed_count),
      sub: null,
    },
    {
      title: "จำนวน SKU ที่มีปัญหา",
      value: formatThaiNumber(data.unique_sku_count),
      sub: null,
    },
    {
      title: "อัพเดทล่าสุด",
      value: data.latest_sync_at ? formatDateThai(data.latest_sync_at) : "-",
      sub: null,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <Card key={c.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">
              {c.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold text-slate-900">{c.value}</p>
            {c.sub && <p className="text-sm text-slate-500">{c.sub}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
