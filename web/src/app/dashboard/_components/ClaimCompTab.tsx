"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClaimSummaryCard } from "./ClaimSummaryCard";
import { ClaimCompensationDialog } from "./ClaimCompensationDialog";
import type { ClaimCompOverall, ClaimCompSkuRow } from "@/types/dashboard";

export function ClaimCompTab() {
  const [overall, setOverall] = useState<ClaimCompOverall | null>(null);
  const [skuRows, setSkuRows] = useState<ClaimCompSkuRow[]>([]);
  const [dialogSku, setDialogSku] = useState<string | null>(null);
  const [dialogModel, setDialogModel] = useState<string>("");
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [overallRes, skuRes] = await Promise.all([
        fetch("/api/claim-compensations/summary"),
        fetch("/api/claim-compensations?view=sku-summary"),
      ]);
      if (overallRes.ok) setOverall(await overallRes.json());
      if (skuRes.ok) setSkuRows(await skuRes.json());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function openDialog(sku: string, model?: string) {
    setDialogSku(sku);
    setDialogModel(model ?? "");
  }

  const filtered = search.trim()
    ? skuRows.filter(
        (r) =>
          r.sku.toLowerCase().includes(search.toLowerCase()) ||
          r.model.toLowerCase().includes(search.toLowerCase())
      )
    : skuRows;

  const fmt = (n: number) => n.toLocaleString("th-TH");

  return (
    <div className="space-y-6">
      <ClaimSummaryCard data={overall} />

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base">ยอดเคลมแยกตามรุ่น (SKU)</CardTitle>
            <input
              type="text"
              placeholder="ค้นหา SKU หรือรุ่น..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-64 rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </CardHeader>
        <CardContent>
          {skuRows.length === 0 && !search ? (
            <p className="py-8 text-center text-sm text-slate-400">
              ยังไม่มีข้อมูลเคลม — กดปุ่ม &quot;บันทึกเคลม&quot; ที่ตารางแยกตามรุ่น หรือรายการงาน
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 font-medium text-slate-700">SKU</th>
                    <th className="px-4 py-3 font-medium text-slate-700">Model</th>
                    <th className="px-4 py-3 font-medium text-slate-700 text-right">งานทั้งหมด</th>
                    <th className="px-4 py-3 font-medium text-slate-700 text-right">บันทึกแล้ว</th>
                    <th className="px-4 py-3 font-medium text-slate-700 text-right">ต้นทุนคืน</th>
                    <th className="px-4 py-3 font-medium text-slate-700 text-right">อะไหล่</th>
                    <th className="px-4 py-3 font-medium text-slate-700 text-right">Deduce</th>
                    <th className="px-4 py-3 font-medium text-slate-700 text-right">สินค้าใหม่</th>
                    <th className="px-4 py-3 font-medium text-slate-700 text-right">รวม (฿)</th>
                    <th className="px-4 py-3 font-medium text-slate-700">ชุด</th>
                    <th className="px-4 py-3 font-medium text-slate-700"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.sku}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-4 py-2 font-mono text-slate-800">{r.sku}</td>
                      <td className="max-w-[140px] truncate px-4 py-2 text-slate-700">
                        {r.model || "-"}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600">{r.total_tasks}</td>
                      <td className="px-4 py-2 text-right">
                        <span className="font-medium text-green-700">
                          {r.compensated_tasks}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600">
                        {r.cost_refund > 0 ? fmt(r.cost_refund) : "-"}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600">
                        {r.spare_parts > 0 ? fmt(r.spare_parts) : "-"}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600">
                        {r.deduce > 0 ? fmt(r.deduce) : "-"}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600">
                        {r.replacement > 0 ? fmt(r.replacement) : "-"}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-green-700">
                        {fmt(r.total_amount)}
                      </td>
                      <td className="px-4 py-2 text-center text-slate-500">{r.batch_count}</td>
                      <td className="px-4 py-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDialog(r.sku, r.model)}
                        >
                          ดู / เพิ่ม
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-4 py-6 text-center text-sm text-slate-400">
                        ไม่พบข้อมูล
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {dialogSku && (
        <ClaimCompensationDialog
          sku={dialogSku}
          model={dialogModel}
          onClose={() => setDialogSku(null)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
