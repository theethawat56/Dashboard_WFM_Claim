export interface SummaryStats {
  total: number;
  repair_count: number;
  claim_count: number;
  reclaim_count: number;
  unfixed_count: number;
  unique_sku_count: number;
}

export interface ByModelRow {
  sku: string;
  model: string;
  total: number;
  repair_count: number;
  claim_count: number;
  reclaim_count: number;
  unfixed_count: number;
  risk_level?: "high" | "medium" | "low";
  top_issue_group?: string;
  peak_month?: string;
}

export interface MonthlyTrendRow {
  month: string;
  repair_count: number;
  claim_count: number;
  reclaim_count: number;
  total: number;
}

export interface SymptomRow {
  issue_group: string;
  frequency: number;
  related_skus: string | null;
}

export interface TaskListRow {
  task_number: string;
  task_type: "repair" | "claim";
  customer_name: string | null;
  product_model: string | null;
  product_serial: string | null;
  sku: string | null;
  issue_group: string | null;
  create_date: string | null;
  timestamp: number | null;
  is_reclaim: number;
  is_unfixed: number;
  ref_task_numbers: string | null;
}

export interface EvidenceRow {
  task_number: string;
  task_type: string;
  timestamp: number | null;
  is_reclaim: number;
  is_unfixed: number;
  customer_name: string | null;
  customer_province: string | null;
  product_model: string | null;
  sku: string | null;
  product_serial: string | null;
  issue_description: string | null;
  issue_group: string | null;
  ref_task_numbers: string | null;
  claim_type: string | null;
  create_date: string | null;
}

export type RiskLevel = "high" | "medium" | "low";
