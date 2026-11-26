"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { bangkokDate } from "@/lib/bangkokDate";

export type DashboardKind = "all" | "clm" | "mnt";

export interface DashboardFilterValue {
  from: string;
  to: string;
  factory: string;
  kind: DashboardKind;
  setFrom: (value: string) => void;
  setTo: (value: string) => void;
  setFactory: (value: string) => void;
  setKind: (value: DashboardKind) => void;
}

const DashboardFilterContext = createContext<DashboardFilterValue | null>(null);

export function DashboardFilterProvider({ children }: { children: ReactNode }) {
  const today = bangkokDate();
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [factory, setFactory] = useState("all");
  const [kind, setKind] = useState<DashboardKind>("all");
  const value = useMemo(
    () => ({ from, to, factory, kind, setFrom, setTo, setFactory, setKind }),
    [from, to, factory, kind]
  );
  return <DashboardFilterContext.Provider value={value}>{children}</DashboardFilterContext.Provider>;
}

export function useDashboardFilter(): DashboardFilterValue {
  const value = useContext(DashboardFilterContext);
  if (!value) throw new Error("Dashboard filter is missing");
  return value;
}

export function DashboardFilterBar() {
  const filter = useDashboardFilter();
  const [factories, setFactories] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/dashboard/factory-portal")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { links?: { id: string; name: string }[] };
        setFactories(body.links ?? []);
      })
      .catch(() => undefined);
  }, []);
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
      <label className="text-xs font-medium text-slate-600">
        วันเปิดงาน จาก
        <input
          type="date"
          value={filter.from}
          max={filter.to}
          onChange={(event) => filter.setFrom(event.target.value)}
          className="mt-1 block h-8 rounded-md border border-slate-300 px-2 text-sm"
        />
      </label>
      <label className="text-xs font-medium text-slate-600">
        ถึง
        <input
          type="date"
          value={filter.to}
          min={filter.from}
          onChange={(event) => filter.setTo(event.target.value)}
          className="mt-1 block h-8 rounded-md border border-slate-300 px-2 text-sm"
        />
      </label>
      <label className="text-xs font-medium text-slate-600">
        โรงงาน
        <select
          value={filter.factory}
          onChange={(event) => filter.setFactory(event.target.value)}
          className="mt-1 block h-8 max-w-[220px] rounded-md border border-slate-300 px-2 text-sm"
        >
          <option value="all">ทุกโรงงาน</option>
          {factories.map((factory) => (
            <option key={factory.id} value={factory.id}>{factory.name}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        ประเภท
        <select
          value={filter.kind}
          onChange={(event) => filter.setKind(event.target.value as DashboardKind)}
          className="mt-1 block h-8 rounded-md border border-slate-300 px-2 text-sm"
        >
          <option value="all">CLM และ MNT</option>
          <option value="clm">CLM</option>
          <option value="mnt">MNT</option>
        </select>
      </label>
    </div>
  );
}
