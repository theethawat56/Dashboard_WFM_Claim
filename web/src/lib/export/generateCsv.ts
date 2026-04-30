import Papa from "papaparse";
import type { EvidenceRow } from "@/types/dashboard";

const CSV_COLUMNS = [
  "task_number",
  "task_type",
  "customer_name",
  "customer_province",
  "product_model",
  "sku",
  "serial_number",
  "issue_description",
  "issue_group",
  "create_date",
  "warranty_id",
  "warranty_start_date",
  "warranty_period",
  "days_to_repair",
  "is_reclaim",
  "ref_task_numbers",
  "claim_type",
  "is_unfixed",
  "customer_guid",
] as const;

function tsToIsoDate(ts: number | null): string {
  if (ts == null || !Number.isFinite(ts)) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function generateCsvFromEvidence(rows: EvidenceRow[]): string {
  const data = rows.map((r) => ({
    task_number: r.task_number,
    task_type: r.task_type,
    customer_name: r.customer_name ?? "",
    customer_province: r.customer_province ?? "",
    product_model: r.product_model ?? "",
    sku: r.sku ?? "",
    serial_number: r.product_serial ?? "",
    issue_description: r.issue_description ?? "",
    issue_group: r.issue_group ?? "",
    create_date: r.create_date && r.create_date.trim() !== ""
      ? r.create_date
      : tsToIsoDate(r.timestamp),
    warranty_id: r.warranty_id ?? "",
    warranty_start_date: r.warranty_start_date ?? "",
    warranty_period: r.warranty_period ?? "",
    days_to_repair: r.days_to_repair ?? "",
    is_reclaim: r.is_reclaim,
    ref_task_numbers: r.ref_task_numbers ?? "",
    claim_type: r.claim_type ?? "",
    is_unfixed: r.is_unfixed,
    customer_guid: r.customer_guid ?? "",
  }));
  return Papa.unparse(data, { columns: [...CSV_COLUMNS] });
}

export function getCsvFilename(sku: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `claim_evidence_${sku}_${date}.csv`;
}
