"use client";

import type { ClaimedModelRow } from "@/types/dashboard";
import { formatThaiNumber } from "@/lib/utils";

function formatClaimedAt(sqlUtc: string): string {
  const iso = sqlUtc.includes("T") ? sqlUtc : sqlUtc.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return sqlUtc || "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function ClaimedModelsCard({ rows }: { rows: ClaimedModelRow[] | null }) {
  if (!rows) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-slate-500">
        กำลังโหลด...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        ยังไม่มีรุ่นที่บันทึกผลเคลมโรงงาน
      </div>
    );
  }

  const jobs = rows.reduce((sum, row) => sum + row.jobs, 0);
  const latest = formatClaimedAt(rows[0]?.last_claimed_at ?? "");

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {formatThaiNumber(rows.length)} รุ่น · {formatThaiNumber(jobs)} งาน · เคลมล่าสุด{" "}
        <b className="text-slate-800">{latest}</b>
      </p>
      <div className="max-h-[280px] overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-3 py-2 font-medium text-slate-700">รุ่น</th>
              <th className="px-3 py-2 text-right font-medium text-slate-700">งาน</th>
              <th className="px-3 py-2 text-right font-medium text-slate-700">เคลมล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.model} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 text-slate-800">{row.model}</td>
                <td className="px-3 py-2 text-right font-medium text-slate-800">
                  {formatThaiNumber(row.jobs)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">
                  {formatClaimedAt(row.last_claimed_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
