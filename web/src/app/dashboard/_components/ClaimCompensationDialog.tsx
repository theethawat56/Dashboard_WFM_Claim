"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CompType, ClaimCompBatch, SkuTaskForBatch } from "@/types/dashboard";

const COMP_TYPES: { value: CompType; label: string }[] = [
  { value: "cost_refund", label: "ต้นทุนสินค้า (คืนเงิน)" },
  { value: "spare_parts", label: "อะไหล่ในการซ่อม" },
  { value: "deduce", label: "Deduce จากต้นทุนรอบถัดไป" },
  { value: "replacement", label: "สินค้าชิ้นใหม่ทดแทน" },
];

interface Props {
  sku: string;
  model?: string;
  preSelectTaskNumber?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function ClaimCompensationDialog({
  sku,
  model,
  preSelectTaskNumber,
  onClose,
  onSaved,
}: Props) {
  const [tasks, setTasks] = useState<SkuTaskForBatch[]>([]);
  const [batches, setBatches] = useState<ClaimCompBatch[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [compType, setCompType] = useState<CompType>("cost_refund");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [tasksRes, batchesRes] = await Promise.all([
          fetch(`/api/claim-compensations?view=tasks&sku=${encodeURIComponent(sku)}`),
          fetch(`/api/claim-compensations?view=batches&sku=${encodeURIComponent(sku)}`),
        ]);
        if (tasksRes.ok) {
          const t: SkuTaskForBatch[] = await tasksRes.json();
          setTasks(t);
          if (preSelectTaskNumber) {
            setSelectedTasks(new Set([preSelectTaskNumber]));
          }
        }
        if (batchesRes.ok) setBatches(await batchesRes.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [sku, preSelectTaskNumber]);

  function toggleTask(taskNumber: string) {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskNumber)) next.delete(taskNumber);
      else next.add(taskNumber);
      return next;
    });
  }

  function selectAll(uncomp: boolean) {
    const filtered = tasks.filter((t) => (uncomp ? !t.already_compensated : true));
    setSelectedTasks(new Set(filtered.map((t) => t.task_number)));
  }

  async function handleSave() {
    if (selectedTasks.size === 0 || !Number(amount)) return;
    setSaving(true);
    try {
      const taskList = tasks
        .filter((t) => selectedTasks.has(t.task_number))
        .map((t) => ({ task_id: t.task_id, task_number: t.task_number }));

      const res = await fetch("/api/claim-compensations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          comp_type: compType,
          amount: Number(amount),
          note: note || null,
          tasks: taskList,
        }),
      });
      if (res.ok) {
        setSelectedTasks(new Set());
        setAmount("");
        setNote("");
        onSaved();
        // Refresh dialog data
        const [tasksRes, batchesRes] = await Promise.all([
          fetch(`/api/claim-compensations?view=tasks&sku=${encodeURIComponent(sku)}`),
          fetch(`/api/claim-compensations?view=batches&sku=${encodeURIComponent(sku)}`),
        ]);
        if (tasksRes.ok) setTasks(await tasksRes.json());
        if (batchesRes.ok) setBatches(await batchesRes.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(batchId: number) {
    setDeleting(batchId);
    try {
      await fetch(`/api/claim-compensations/${batchId}`, { method: "DELETE" });
      onSaved();
      const [tasksRes, batchesRes] = await Promise.all([
        fetch(`/api/claim-compensations?view=tasks&sku=${encodeURIComponent(sku)}`),
        fetch(`/api/claim-compensations?view=batches&sku=${encodeURIComponent(sku)}`),
      ]);
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (batchesRes.ok) setBatches(await batchesRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(null);
    }
  }

  const compLabel = (t: string) => COMP_TYPES.find((c) => c.value === t)?.label ?? t;
  const batchTotal = batches.reduce((s, b) => s + b.amount, 0);

  function fmtDate(ts: number | null) {
    if (ts == null) return "-";
    const d = new Date(ts);
    return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-200 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">
            บันทึกผลเคลม — {sku}
          </h3>
          {model && <p className="text-sm text-slate-500">{model}</p>}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-400">กำลังโหลด...</p>
          ) : (
            <div className="space-y-5">
              {/* Existing batches */}
              {batches.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-medium text-slate-600">
                    ประวัติเคลม ({batches.length} ชุด / รวม{" "}
                    {batchTotal.toLocaleString("th-TH")} บาท)
                  </p>
                  <div className="space-y-2">
                    {batches.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-start justify-between rounded-md border border-slate-200 bg-white p-2 text-xs"
                      >
                        <div>
                          <span className="font-medium text-slate-700">
                            {compLabel(b.comp_type)}
                          </span>
                          <span className="ml-2 font-bold text-green-700">
                            {b.amount.toLocaleString("th-TH")} ฿
                          </span>
                          {b.note && (
                            <span className="ml-2 text-slate-400">({b.note})</span>
                          )}
                          <div className="mt-0.5 text-slate-400">
                            งาน: {b.task_numbers.join(", ")} ({b.created_at})
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDelete(b.id)}
                          disabled={deleting === b.id}
                          className="ml-2 flex-shrink-0 text-red-500 hover:text-red-700 disabled:opacity-50"
                        >
                          {deleting === b.id ? "..." : "ลบ"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Task selection */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">
                    เลือกเลขงานที่ต้องการบันทึก ({selectedTasks.size}/{tasks.length})
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => selectAll(true)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      เลือกที่ยังไม่ได้เคลม
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTasks(new Set())}
                      className="text-xs text-slate-400 hover:underline"
                    >
                      ล้าง
                    </button>
                  </div>
                </div>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {tasks.length === 0 && (
                    <p className="py-4 text-center text-xs text-slate-400">
                      ไม่พบงานสำหรับ SKU นี้
                    </p>
                  )}
                  {tasks.map((t) => (
                    <label
                      key={t.task_number}
                      className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                        selectedTasks.has(t.task_number)
                          ? "bg-blue-50"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTasks.has(t.task_number)}
                        onChange={() => toggleTask(t.task_number)}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                      <span className="font-mono text-slate-700">{t.task_number}</span>
                      <Badge
                        variant={t.task_type === "repair" ? "repair" : "claim"}
                        className="scale-75"
                      >
                        {t.task_type === "repair" ? "ซ่อม" : "เคลม"}
                      </Badge>
                      <span className="text-slate-400">{fmtDate(t.timestamp)}</span>
                      {t.is_reclaim === 1 && (
                        <Badge variant="reclaim" className="scale-75">ซ้ำ</Badge>
                      )}
                      {t.already_compensated && (
                        <span className="ml-auto rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                          บันทึกแล้ว
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              {/* Compensation form */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">ข้อมูลเคลม</p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    ประเภทชดเชย
                  </label>
                  <select
                    value={compType}
                    onChange={(e) => setCompType(e.target.value as CompType)}
                    className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {COMP_TYPES.map((ct) => (
                      <option key={ct.value} value={ct.value}>
                        {ct.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      จำนวนเงิน (บาท)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      หมายเหตุ (ไม่บังคับ)
                    </label>
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="เช่น Lot 2024-03"
                      className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-slate-200 px-6 py-3">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onClose}>
              ปิด
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || selectedTasks.size === 0 || !Number(amount)}
            >
              {saving ? "กำลังบันทึก..." : `บันทึก (${selectedTasks.size} งาน)`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
