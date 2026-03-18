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

export function buildExcelBuffer(input: ExcelInput): Buffer {
  const wb = XLSX.utils.book_new();

  const summaryData = [
    ["SKU", "รุ่น", "งานซ่อม", "งานเคลม", "รวม", "เคลมซ้ำ", "ซ่อมไม่หาย", "ความเสี่ยง"],
    ...input.modelStats.map((r) => [
      r.sku,
      r.model,
      r.repair_count,
      r.claim_count,
      r.total,
      r.reclaim_count,
      r.unfixed_count,
      r.risk_level === "high" ? "สูงมาก" : r.risk_level === "medium" ? "กลาง" : "ต่ำ",
    ]),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, "สรุปรายรุ่น");

  for (const [sku, rows] of Object.entries(input.evidenceBySku)) {
    const sheetName = `${sku}_tasks`.slice(0, 31);
    const sheetData = [
      [
        "task_number",
        "task_type",
        "customer_name",
        "product_model",
        "sku",
        "product_serial",
        "issue_group",
        "create_date",
        "is_reclaim",
        "ref_task_numbers",
      ],
      ...rows.map((r) => [
        r.task_number,
        r.task_type,
        r.customer_name ?? "",
        r.product_model ?? "",
        r.sku ?? "",
        r.product_serial ?? "",
        r.issue_description ?? "", // issue_group column filled with issue_description
        r.create_date ?? "",
        r.is_reclaim,
        r.ref_task_numbers ?? "",
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
