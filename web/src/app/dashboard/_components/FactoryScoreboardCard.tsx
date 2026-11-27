"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardFilter } from "./DashboardFilter";

interface Pair {
  clm: number;
  mnt: number;
}

interface Median {
  clm: number | null;
  mnt: number | null;
}

interface ScoreRow {
  id: string;
  shortName: string;
  ready: Pair;
  missing: Pair;
  waiting: Pair;
  approved: Pair;
  rejected: Pair;
  medianDays: Median;
  bahtPerJob: Median;
  returnRate: number | null;
}

function num(value: number): string {
  return value.toLocaleString("th-TH");
}

function days(value: number | null): string {
  return value == null ? "—" : num(value);
}

function rate(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

export function FactoryScoreboardCard() {
  const filter = useDashboardFilter();
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({
      from: filter.from,
      to: filter.to,
      factory: filter.factory,
      kind: filter.kind,
    });
    let cancelled = false;
    fetch(`/api/dashboard/factory-scoreboard?${params}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("โหลดตารางคะแนนโรงงานไม่สำเร็จ");
        return (await response.json()) as { rows: ScoreRow[] };
      })
      .then((json) => {
        if (cancelled) return;
        setRows(json.rows);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "โหลดตารางคะแนนโรงงานไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [filter.from, filter.to, filter.factory, filter.kind]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">คะแนนโรงงาน</CardTitle>
        <p className="text-sm text-slate-500">
          ใช้ตัวกรองด้านบน วันที่ตอบและบาทต่องานนับเฉพาะงานที่มีวันส่งจริง
        </p>
      </CardHeader>
      <CardContent>
        {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>}
        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-2" rowSpan={2}>โรงงาน</th>
                {["พร้อมส่ง", "ขาดข้อมูล", "รอตอบ", "ยอมรับ", "ปฏิเสธ", "วันตอบ", "บาท/งาน"].map((label) => (
                  <th key={label} className="px-2 py-2 text-center" colSpan={2}>{label}</th>
                ))}
                <th className="px-2 py-2 text-right" rowSpan={2}>อัตรากลับมา</th>
              </tr>
              <tr>
                {Array.from({ length: 7 }).flatMap((_, index) => [
                  <th key={`${index}-c`} className="px-2 py-1 text-right text-violet-700">CLM</th>,
                  <th key={`${index}-m`} className="px-2 py-1 text-right text-sky-700">MNT</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-2 py-2 font-medium text-slate-800">{row.shortName}</td>
                  <PairCells pair={row.ready} />
                  <PairCells pair={row.missing} />
                  <PairCells pair={row.waiting} />
                  <PairCells pair={row.approved} />
                  <PairCells pair={row.rejected} />
                  <td className="px-2 py-2 text-right">{days(row.medianDays.clm)}</td>
                  <td className="px-2 py-2 text-right">{days(row.medianDays.mnt)}</td>
                  <td className="px-2 py-2 text-right">{days(row.bahtPerJob.clm)}</td>
                  <td className="px-2 py-2 text-right">{days(row.bahtPerJob.mnt)}</td>
                  <td className="px-2 py-2 text-right">{rate(row.returnRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function PairCells({ pair }: { pair: Pair }) {
  return (
    <>
      <td className="px-2 py-2 text-right">{num(pair.clm)}</td>
      <td className="px-2 py-2 text-right">{num(pair.mnt)}</td>
    </>
  );
}
