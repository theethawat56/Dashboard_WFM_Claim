"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SkuFactoryRow {
  sku: string;
  model: string;
  pending: number;
  suggestedFactoryId: string | null;
  suggestedFactoryName: string | null;
  supplierName: string | null;
}

const FACTORIES = [
  { id: "midea", name: "MIDEA" },
  { id: "jonr", name: "JONR" },
  { id: "welland", name: "WELLAND" },
  { id: "genhigh", name: "GENHIGH" },
  { id: "stc", name: "STC" },
  { id: "hizero", name: "HIZERO" },
];

export function SkuFactoryMapCard() {
  const [rows, setRows] = useState<SkuFactoryRow[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});

  async function load(): Promise<void> {
    const response = await fetch("/api/dashboard/sku-factories");
    if (!response.ok) throw new Error("โหลด SKU ที่ยังไม่ผูกโรงงานไม่สำเร็จ");
    const json = (await response.json()) as { rows: SkuFactoryRow[] };
    setRows(json.rows);
  }

  useEffect(() => {
    load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "โหลดไม่สำเร็จ"));
  }, []);

  async function save(sku: string, body: { factoryId?: string; exclude?: boolean; reason?: string }): Promise<void> {
    setError(null);
    const response = await fetch("/api/dashboard/sku-factories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, ...body }),
    });
    const json = (await response.json()) as { error?: string; rows?: SkuFactoryRow[] };
    if (!response.ok) {
      setError(json.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    setRows(json.rows ?? []);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">SKU ที่ยังไม่ผูกโรงงาน {rows.length.toLocaleString("th-TH")} รายการ</CardTitle>
        <p className="text-sm text-slate-500">
          ระบบเสนอโรงงานจาก supplier ที่มียอดสั่งมากสุดใน PO ต้องกดยืนยันก่อน งานจึงหลุดจากแถวยังไม่จับได้
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>}
        <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm" onClick={() => setOpen((value) => !value)}>
          {open ? "ซ่อนหน้าผูก SKU" : "ไปหน้าผูก SKU"}
        </button>
        {open && (
          <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">รุ่น</th>
                  <th className="px-3 py-2 text-right">ค้าง</th>
                  <th className="px-3 py-2">เสนอจาก PO</th>
                  <th className="px-3 py-2">ยืนยัน</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.sku} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-mono">{row.sku}</td>
                    <td className="px-3 py-2">{row.model}</td>
                    <td className="px-3 py-2 text-right">{row.pending.toLocaleString("th-TH")}</td>
                    <td className="px-3 py-2">{row.suggestedFactoryName ?? row.supplierName ?? "ไม่มี PO"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <select
                          className="h-8 rounded-md border border-slate-300 px-2 text-xs"
                          defaultValue={row.suggestedFactoryId ?? ""}
                          onChange={(event) => {
                            if (event.target.value) save(row.sku, { factoryId: event.target.value }).catch(() => undefined);
                          }}
                        >
                          <option value="">เลือกโรงงาน</option>
                          {FACTORIES.map((factory) => (
                            <option key={factory.id} value={factory.id}>{factory.name}</option>
                          ))}
                        </select>
                        <input
                          value={reason[row.sku] ?? ""}
                          onChange={(event) => setReason((current) => ({ ...current, [row.sku]: event.target.value }))}
                          placeholder="เหตุผลที่ไม่เคลม"
                          className="h-8 w-36 rounded-md border border-slate-300 px-2 text-xs"
                        />
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                          onClick={() => save(row.sku, { exclude: true, reason: reason[row.sku] ?? "" }).catch(() => undefined)}
                        >
                          ไม่เคลม
                        </button>
                      </div>
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
