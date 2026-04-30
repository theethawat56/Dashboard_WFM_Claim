import * as XLSX from "xlsx";
import type { ByModelRow } from "@/types/dashboard";
import type { TaskListRow } from "@/types/dashboard";
import type { SymptomRow } from "@/types/dashboard";
import type { EvidenceRow } from "@/types/dashboard";

export interface ExcelInput {
  modelStats: ByModelRow[];
  taskList: TaskListRow[];
  symptoms: SymptomRow[];
  evidenceSummary: Array<{
    sku: string;
    model: string;
    total: number;
    repair_count: number;
    claim_count: number;
    reclaim_count: number;
    unfixed_count: number;
    risk_level?: string;
  }>;
  evidenceBySku: Record<string, EvidenceRow[]>;
}

function formatTimestamp(ts: number | null): string {
  if (ts == null) return "";
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function resolveCreateDate(r: EvidenceRow): string {
  return r.create_date && r.create_date.trim() !== ""
    ? r.create_date
    : formatTimestamp(r.timestamp);
}

function summarizeSkuDates(rows: EvidenceRow[]): {
  firstDate: string;
  lastDate: string;
  warrantyMin: string;
  warrantyMax: string;
  avgDaysToRepair: string;
} {
  const taskDates = rows
    .map((r) => resolveCreateDate(r))
    .filter((s) => s && s.trim() !== "")
    .sort();
  const warrantyDates = rows
    .map((r) => r.warranty_start_date ?? "")
    .filter((s) => s && s.trim() !== "")
    .sort();
  const days = rows
    .map((r) => r.days_to_repair)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0);
  const avg =
    days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : null;

  return {
    firstDate: taskDates[0] ?? "",
    lastDate: taskDates[taskDates.length - 1] ?? "",
    warrantyMin: warrantyDates[0] ?? "",
    warrantyMax: warrantyDates[warrantyDates.length - 1] ?? "",
    avgDaysToRepair: avg != null ? avg.toFixed(1) : "",
  };
}

export function buildExcelBuffer(input: ExcelInput): Buffer {
  const wb = XLSX.utils.book_new();

  const summaryData: (string | number)[][] = [
    [
      "SKU",
      "รุ่น",
      "งานซ่อม",
      "งานเคลม",
      "รวม",
      "เคลมซ้ำ",
      "ซ่อมไม่หาย",
      "ความเสี่ยง",
      "วันที่งานแรก",
      "วันที่งานล่าสุด",
      "วันเริ่มประกัน (เร็วสุด)",
      "วันเริ่มประกัน (ล่าสุด)",
      "อายุก่อนซ่อมเฉลี่ย (วัน)",
    ],
  ];
  for (const r of input.modelStats) {
    const rows = input.evidenceBySku[r.sku] ?? [];
    const dates = summarizeSkuDates(rows);
    summaryData.push([
      r.sku,
      r.model,
      r.repair_count,
      r.claim_count,
      r.total,
      r.reclaim_count,
      r.unfixed_count,
      r.risk_level === "high" ? "สูงมาก" : r.risk_level === "medium" ? "กลาง" : "ต่ำ",
      dates.firstDate,
      dates.lastDate,
      dates.warrantyMin,
      dates.warrantyMax,
      dates.avgDaysToRepair,
    ]);
  }
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, "สรุปรายรุ่น");

  // Flat sheet: all tasks across selected SKUs in one place — easy to filter / pivot.
  const allTasksData: (string | number)[][] = [
    [
      "task_number",
      "task_type",
      "customer_name",
      "product_model",
      "sku",
      "product_serial",
      "issue_group",
      "create_date",
      "warranty_id",
      "warranty_start_date",
      "warranty_period",
      "days_to_repair",
      "is_reclaim",
      "ref_task_numbers",
      "customer_guid",
    ],
  ];
  for (const rows of Object.values(input.evidenceBySku)) {
    for (const r of rows) {
      allTasksData.push([
        r.task_number,
        r.task_type,
        r.customer_name ?? "",
        r.product_model ?? "",
        r.sku ?? "",
        r.product_serial ?? "",
        r.issue_group ?? r.issue_description ?? "",
        resolveCreateDate(r),
        r.warranty_id ?? "",
        r.warranty_start_date ?? "",
        r.warranty_period ?? "",
        r.days_to_repair != null ? r.days_to_repair : "",
        r.is_reclaim,
        r.ref_task_numbers ?? "",
        r.customer_guid ?? "",
      ]);
    }
  }
  if (allTasksData.length > 1) {
    const wsAll = XLSX.utils.aoa_to_sheet(allTasksData);
    XLSX.utils.book_append_sheet(wb, wsAll, "งานทั้งหมด");
  }

  for (const [sku, rows] of Object.entries(input.evidenceBySku)) {
    const sheetName = `${sku}_tasks`.slice(0, 31);
    const sheetData: (string | number)[][] = [
      [
        "task_number",
        "task_type",
        "customer_name",
        "product_model",
        "sku",
        "product_serial",
        "issue_group",
        "create_date",
        "warranty_id",
        "warranty_start_date",
        "warranty_period",
        "days_to_repair",
        "is_reclaim",
        "ref_task_numbers",
        "customer_guid",
      ],
      ...rows.map((r) => [
        r.task_number,
        r.task_type,
        r.customer_name ?? "",
        r.product_model ?? "",
        r.sku ?? "",
        r.product_serial ?? "",
        r.issue_group ?? r.issue_description ?? "",
        resolveCreateDate(r),
        r.warranty_id ?? "",
        r.warranty_start_date ?? "",
        r.warranty_period ?? "",
        r.days_to_repair != null ? r.days_to_repair : "",
        r.is_reclaim,
        r.ref_task_numbers ?? "",
        r.customer_guid ?? "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}

export function getExcelFilename(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `factory_claim_report_${date}.xlsx`;
}
