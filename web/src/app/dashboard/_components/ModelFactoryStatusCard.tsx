"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FactorySendStatus, ModelFactoryStatusData } from "@/types/dashboard";
import { useDashboardFilter } from "./DashboardFilter";

type StatusFilter = "all" | FactorySendStatus;

const STATUS_LABEL: Record<FactorySendStatus, string> = {
  not_sent: "ยังไม่ส่ง",
  waiting: "ส่งแล้วรอชดเชย",
  compensated: "ได้ชดเชยแล้ว",
  mixed: "มีหลายสถานะ",
};

const STATUS_CLASS: Record<FactorySendStatus, string> = {
  not_sent: "bg-slate-100 text-slate-700",
  waiting: "bg-amber-50 text-amber-800",
  compensated: "bg-green-50 text-green-800",
  mixed: "bg-blue-50 text-blue-800",
};

function num(n: number): string {
  return n.toLocaleString("th-TH");
}

function formatDmy(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function ModelFactoryStatusCard() {
  const filter = useDashboardFilter();
  const [data, setData] = useState<ModelFactoryStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from: filter.from, to: filter.to });
    fetch(`/api/dashboard/model-factory-status?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("โหลดสรุปส่งโรงงานไม่สำเร็จ");
        return (await res.json()) as ModelFactoryStatusData;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "โหลดสรุปส่งโรงงานไม่สำเร็จ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter.from, filter.to, reloadKey]);

  useEffect(() => {
    const refresh = () => setReloadKey((value) => value + 1);
    window.addEventListener("factory-submission-changed", refresh);
    return () => window.removeEventListener("factory-submission-changed", refresh);
  }, []);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.rows ?? []).filter((row) => {
      if (status === "not_sent" && row.status !== "not_sent") return false;
      if (status === "waiting" && row.sent_waiting <= 0) return false;
      if (status === "compensated" && row.compensated <= 0) return false;
      if (status === "mixed" && row.status !== "mixed") return false;
      if (!needle) return true;
      return row.model.toLowerCase().includes(needle);
    });
  }, [data, status, search]);

  const counts = useMemo(() => {
    const list = data?.rows ?? [];
    return {
      notSent: list.filter((row) => row.status === "not_sent").length,
      waiting: list.filter((row) => row.sent_waiting > 0 && row.status !== "compensated").length,
      compensated: list.filter((row) => row.compensated > 0).length,
    };
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">รุ่นปีนี้ที่ต้องเคลมโรงงาน</CardTitle>
        <p className="mt-1 text-sm text-slate-500">
          ใช้ช่วงวันเปิดงานจากตัวกรองด้านบน เฉพาะ SKU โรงงานที่อยู่ในประกัน นับ 1 งานเป็น 1 เครื่อง แยก CLM กับ MNT
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] text-xs font-medium text-slate-600">
            ค้นหารุ่น
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ชื่อรุ่น"
              className="mt-1 block h-8 w-full rounded-md border border-slate-300 px-2 text-sm"
            />
          </label>
          {data && (
            <p className="pb-1 text-xs text-slate-500">
              ช่วง {formatDmy(data.from)} – {formatDmy(data.to)}
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="เครื่องทั้งหมด" clm={data ? num(data.units_clm) : "—"} mnt={data ? num(data.units_mnt) : "—"} />
          <Stat label="ยังไม่ส่ง" clm={data ? num(data.not_sent_clm) : "—"} mnt={data ? num(data.not_sent_mnt) : "—"} />
          <Stat label="ส่งแล้วรอชดเชย" clm={data ? num(data.sent_waiting_clm) : "—"} mnt={data ? num(data.sent_waiting_mnt) : "—"} />
          <Stat label="ได้ชดเชยแล้ว" clm={data ? num(data.compensated_clm) : "—"} mnt={data ? num(data.compensated_mnt) : "—"} />
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", `ทุกรุ่น (${data?.rows.length ?? 0})`],
              ["not_sent", `ยังไม่ส่ง (${counts.notSent})`],
              ["waiting", `รอชดเชย (${counts.waiting})`],
              ["compensated", `มีชดเชย (${counts.compensated})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatus(id)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                status === id ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && !data ? (
          <p className="text-sm text-slate-500">กำลังโหลด...</p>
        ) : rows.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
            ไม่มีงานในช่วงนี้
          </div>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 font-medium text-slate-700">รุ่น</th>
                  <th className="px-3 py-2 text-right font-medium text-violet-800">CLM</th>
                  <th className="px-3 py-2 text-right font-medium text-violet-800">CLM ยังไม่ส่ง</th>
                  <th className="px-3 py-2 text-right font-medium text-violet-800">CLM รอชดเชย</th>
                  <th className="px-3 py-2 text-right font-medium text-violet-800">CLM ได้ชดเชย</th>
                  <th className="px-3 py-2 text-right font-medium text-sky-800">MNT</th>
                  <th className="px-3 py-2 text-right font-medium text-sky-800">MNT ยังไม่ส่ง</th>
                  <th className="px-3 py-2 text-right font-medium text-sky-800">MNT รอชดเชย</th>
                  <th className="px-3 py-2 text-right font-medium text-sky-800">MNT ได้ชดเชย</th>
                  <th className="px-3 py-2 font-medium text-slate-700">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.model} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-slate-800">{row.model}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800">{num(row.units_clm)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{num(row.not_sent_clm)}</td>
                    <td className="px-3 py-2 text-right text-amber-800">{num(row.sent_waiting_clm)}</td>
                    <td className="px-3 py-2 text-right text-green-800">{num(row.compensated_clm)}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800">{num(row.units_mnt)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{num(row.not_sent_mnt)}</td>
                    <td className="px-3 py-2 text-right text-amber-800">{num(row.sent_waiting_mnt)}</td>
                    <td className="px-3 py-2 text-right text-green-800">{num(row.compensated_mnt)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[row.status]}`}>
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, clm, mnt }: { label: string; clm: string; mnt: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <div>
          <div className="text-[11px] font-medium text-violet-700">CLM</div>
          <div className="text-lg font-semibold text-slate-900">{clm}</div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-sky-700">MNT</div>
          <div className="text-lg font-semibold text-slate-900">{mnt}</div>
        </div>
      </div>
    </div>
  );
}
