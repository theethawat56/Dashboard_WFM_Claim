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
  id: string;
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
  customer_guid: string | null;
  warranty_id: string | null;
  warranty_start_date: string | null;
  warranty_period: string | null;
  days_to_repair: number | null;
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
  customer_guid: string | null;
  warranty_id: string | null;
  warranty_start_date: string | null;
  warranty_period: string | null;
  days_to_repair: number | null;
}

export interface DailyTrendRow {
  date: string;
  repair_count: number;
  claim_count: number;
  reclaim_count: number;
  total: number;
}

export interface DailyTopSkuRow {
  rank: number;
  date: string;
  sku: string;
  model: string;
  repair_count: number;
  claim_count: number;
  reclaim_count: number;
  total: number;
}

export type CompType = "cost_refund" | "spare_parts" | "deduce" | "replacement";

export interface ClaimCompBatch {
  id: number;
  sku: string;
  comp_type: CompType;
  amount: number;
  note: string | null;
  created_at: string;
  task_numbers: string[];
}

export interface ClaimCompSkuRow {
  sku: string;
  model: string;
  total_tasks: number;
  compensated_tasks: number;
  total_amount: number;
  cost_refund: number;
  spare_parts: number;
  deduce: number;
  replacement: number;
  batch_count: number;
}

export interface ClaimCompOverall {
  total_amount: number;
  cost_refund: number;
  spare_parts: number;
  deduce: number;
  replacement: number;
  compensated_task_count: number;
  total_claim_task_count: number;
  top_skus: { sku: string; model: string; total_amount: number }[];
}

export interface SkuTaskForBatch {
  task_id: string;
  task_number: string;
  task_type: string;
  timestamp: number | null;
  is_reclaim: number;
  already_compensated: boolean;
}

export type RiskLevel = "high" | "medium" | "low";
