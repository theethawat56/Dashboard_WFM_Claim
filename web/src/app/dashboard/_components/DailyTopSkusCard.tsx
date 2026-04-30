"use client";

import type { DailyTopSkuRow } from "@/types/dashboard";
import { formatThaiNumber } from "@/lib/utils";

const MEDAL = ["🥇", "🥈", "🥉", "4", "5"];

const RANK_STYLES: Record<number, string> = {
  1: "bg-yellow-50 border-yellow-300",
  2: "bg-slate-50 border-slate-300",
  3: "bg-orange-50 border-orange-300",
};

export function DailyTopSkusCard({
  data,
  date,
  onDateChange,
}: {
  data: DailyTopSkuRow[];
  date: string;
  onDateChange: (d: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-slate-600">วันที่:</label>
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="h-8 rounded-md border border-slate-300 px-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {data.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
          ไม่มีข้อมูลงานในวันที่เลือก
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((row) => (
            <div
              key={row.sku}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                RANK_STYLES[row.rank] ?? "bg-white border-slate-200"
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-lg font-bold shadow-sm">
                {row.rank <= 3 ? MEDAL[row.rank - 1] : (
                  <span className="text-sm text-slate-500">#{row.rank}</span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-mono text-sm font-semibold text-slate-800">
                    {row.sku}
                  </span>
                  <span className="truncate text-xs text-slate-500">
                    {row.model || ""}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
                  <span>
                    ซ่อม <b className="text-blue-700">{formatThaiNumber(row.repair_count)}</b>
                  </span>
                  <span>
                    เคลม <b className="text-orange-700">{formatThaiNumber(row.claim_count)}</b>
                  </span>
                  <span>
                    เคลมซ้ำ <b className="text-red-700">{formatThaiNumber(row.reclaim_count)}</b>
                  </span>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-lg font-bold text-slate-800">
                  {formatThaiNumber(row.total)}
                </div>
                <div className="text-[10px] text-slate-400">รวม</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
