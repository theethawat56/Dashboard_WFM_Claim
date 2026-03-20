"use client";

import { Badge } from "@/components/ui/badge";
import { formatDateThai } from "@/lib/utils";

export interface TaskRow {
  task_number: string;
  task_type: "repair" | "claim";
  customer_name: string | null;
  product_model: string | null;
  product_serial: string | null;
  sku: string | null;
  issue_description: string | null;
  issue_group: string | null;
  create_date: string | null;
  timestamp: number | null;
  is_reclaim: number;
  is_unfixed: number;
  ref_task_numbers: string | null;
}

export function TaskListTable({
  rows,
  page,
  total,
  limit,
  onPageChange,
  claimedSelected,
  onToggleClaimed,
}: {
  rows: TaskRow[];
  page: number;
  total: number;
  limit: number;
  onPageChange: (p: number) => void;
  claimedSelected: Set<string>;
  onToggleClaimed: (row: TaskRow) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
        ไม่พบรายการงานที่ตรงกับตัวกรอง
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-700">เลขงาน</th>
              <th className="px-4 py-3 font-medium text-slate-700">ประเภท</th>
              <th className="px-4 py-3 font-medium text-slate-700">ลูกค้า</th>
              <th className="px-4 py-3 font-medium text-slate-700">รุ่น</th>
              <th className="px-4 py-3 font-medium text-slate-700">SKU</th>
              <th className="px-4 py-3 font-medium text-slate-700">Serial</th>
              <th className="max-w-[200px] px-4 py-3 font-medium text-slate-700">
                อาการ
              </th>
              <th className="px-4 py-3 font-medium text-slate-700">วันที่</th>
              <th className="px-4 py-3 font-medium text-slate-700">เคลมซ้ำ</th>
              <th className="px-4 py-3 font-medium text-slate-700">อ้างอิง</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.task_number}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-2 font-mono text-slate-800">
                  <div className="flex flex-col gap-2">
                    <span>{r.task_number}</span>
                    <button
                      type="button"
                      onClick={() => onToggleClaimed(r)}
                      className={[
                        "inline-flex h-7 items-center justify-center rounded-md border px-2 text-xs font-medium",
                        claimedSelected.has(r.task_number)
                          ? "border-[#E65100] bg-[#E65100] text-white hover:bg-[#C44E00]"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                      ].join(" ")}
                      title="คลิกเพื่อเลือก/ยกเลิก Claimed"
                    >
                      Claimed
                    </button>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <Badge
                    variant={r.task_type === "repair" ? "repair" : "claim"}
                  >
                    {r.task_type === "repair" ? "ซ่อม" : "เคลม"}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-slate-700">
                  {r.customer_name ?? "-"}
                </td>
                <td className="px-4 py-2 text-slate-700">
                  {r.product_model ?? "-"}
                </td>
                <td className="px-4 py-2 font-mono text-slate-700">
                  {r.sku ?? "-"}
                </td>
                <td className="px-4 py-2 font-mono text-slate-700">
                  {r.product_serial ?? "-"}
                </td>
                <td className="max-w-[200px] truncate px-4 py-2 text-slate-600">
                  {(r.issue_group ?? "").length > 60
                    ? (r.issue_group ?? "").slice(0, 60) + "…"
                    : r.issue_group ?? "-"}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {formatDateThai(r.create_date ?? r.timestamp)}
                </td>
                <td className="px-4 py-2">
                  <span className="flex flex-wrap gap-1">
                    {r.is_reclaim === 1 && (
                      <Badge variant="reclaim">ซ้ำ</Badge>
                    )}
                    {r.is_unfixed === 1 && (
                      <Badge variant="unfixed">ไม่หาย</Badge>
                    )}
                    {r.is_reclaim !== 1 && r.is_unfixed !== 1 && "-"}
                  </span>
                </td>
                <td className="max-w-[120px] truncate px-4 py-2 font-mono text-slate-600">
                  {r.ref_task_numbers ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">
            แสดง {(page - 1) * limit + 1}–{Math.min(page * limit, total)} จาก{" "}
            {total} รายการ
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="rounded border border-slate-300 bg-white px-3 py-1 text-sm disabled:opacity-50"
            >
              ก่อนหน้า
            </button>
            <span className="flex items-center px-2 text-sm text-slate-600">
              หน้า {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="rounded border border-slate-300 bg-white px-3 py-1 text-sm disabled:opacity-50"
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
