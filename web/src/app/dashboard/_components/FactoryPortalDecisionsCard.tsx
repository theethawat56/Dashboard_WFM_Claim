"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Pending = {
  taskId: string;
  taskNumber: string;
  factoryName: string;
  sku: string;
  decision: string;
  compType: string | null;
  amount: number | null;
  note: string | null;
  reason: string | null;
  status: string;
  submittedAt: string | null;
};

type LinkRow = { id: string; name: string; url: string };

const COMP_LABEL: Record<string, string> = {
  cost_refund: "ต้นทุนสินค้า (คืนเงิน)",
  spare_parts: "อะไหล่ในการซ่อม",
  deduce: "Deduce จากต้นทุนรอบถัดไป",
  replacement: "สินค้าชิ้นใหม่ทดแทน",
};

function when(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
}

export function FactoryPortalDecisionsCard() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/dashboard/factory-portal");
      const body = (await response.json()) as { pending?: Pending[]; links?: LinkRow[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "โหลดคำตอบจากโรงงานไม่สำเร็จ");
      setPending(body.pending ?? []);
      setLinks(body.links ?? []);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "โหลดคำตอบจากโรงงานไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(taskId: string, action: "confirm" | "return") {
    setBusyId(taskId);
    setError(null);
    try {
      const response = await fetch("/api/dashboard/factory-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, action }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "บันทึกไม่สำเร็จ");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">คำตอบจากโรงงาน</CardTitle>
        <p className="text-sm text-slate-500">
          โรงงานกดจากลิงก์ด้านล่าง ผลยังไม่เข้าบันทึกผลเคลมจนกว่าจะกดยืนยัน ถ้าตีกลับ โรงงานเลือกใหม่ได้จากลิงก์เดิม
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>}

        <div className="grid gap-2">
          {links.map((link) => (
            <div key={link.id} className="rounded-md border border-slate-200 px-3 py-2">
              <p className="text-sm font-medium text-slate-800">{link.name}</p>
              <a className="mt-1 block break-all text-xs text-blue-700" href={link.url} target="_blank" rel="noreferrer">
                {link.url}
              </a>
            </div>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">กำลังโหลด…</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-slate-600">ยังไม่มีคำตอบที่รอตรวจ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">งาน</th>
                  <th className="px-2 py-2 font-medium">โรงงาน</th>
                  <th className="px-2 py-2 font-medium">คำตอบ</th>
                  <th className="px-2 py-2 font-medium">เมื่อ</th>
                  <th className="px-2 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr key={row.taskId} className="border-t border-slate-100">
                    <td className="px-2 py-2">
                      <div className="font-medium">{row.taskNumber}</div>
                      <div className="text-xs text-slate-500">{row.sku || "—"}</div>
                    </td>
                    <td className="px-2 py-2 text-xs">{row.factoryName}</td>
                    <td className="px-2 py-2">
                      {row.decision === "approved" ? (
                        <span>
                          {COMP_LABEL[row.compType ?? ""] ?? row.compType} ·{" "}
                          {(row.amount ?? 0).toLocaleString("th-TH")} บาท
                          {row.note ? <span className="block text-xs text-slate-500">{row.note}</span> : null}
                        </span>
                      ) : (
                        <span>
                          ปฏิเสธ
                          {row.reason ? <span className="block text-xs text-slate-500">{row.reason}</span> : null}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-600">{when(row.submittedAt)}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        {row.decision === "approved" && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={busyId === row.taskId}
                            onClick={() => void act(row.taskId, "confirm")}
                          >
                            ยืนยันเข้าบันทึกผลเคลม
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyId === row.taskId}
                          onClick={() => void act(row.taskId, "return")}
                        >
                          ตีกลับ
                        </Button>
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
