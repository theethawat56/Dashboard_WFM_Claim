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

export type PoMatchTier = "green" | "orange" | "yellow" | "gray";

export interface FactoryClaimKpis {
  po_count: number;
  line_count: number;
  case_total: number;
  matched: number;
  green: number;
  orange: number;
  yellow: number;
  gray: number;
  damage_total: number;
  damage_year: string;
  last_synced_at: string | null;
}

export interface FactoryPoSkuRow {
  po_id: number;
  po_number_out: string;
  po_number: string;
  reference: string;
  po_date: string | null;
  status: string | null;
  payment_status: string | null;
  supplier_name: string;
  sku: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  matched_cases: number;
  claim_rate_pct: number | null;
  damage_amount: number;
}

export interface FactoryMatchRow {
  task_id: string;
  task_number: string;
  task_type: string;
  sku: string;
  product_name: string;
  supplier_name: string;
  ref_date: string | null;
  ref_date_source: string;
  match_tier: PoMatchTier;
  po_id: number | null;
  po_number_out: string | null;
  po_date: string | null;
  po_status: string | null;
  po_payment_status: string | null;
  unit_cost: number | null;
  po_sku_qty: number | null;
  match_note: string;
  claims_on_this_po_sku: number | null;
  claim_rate_pct: number | null;
}

export interface FactoryPoHeaderRow {
  id: number;
  po_number: string;
  po_date: string | null;
  status: string | null;
  payment_status: string | null;
  supplier_name: string;
  supplier_code: string | null;
  reference: string | null;
  total_amount: number;
  total_quantity: number;
  payment_amount: number;
  currency: string | null;
  created_by: string | null;
  payment_term: string | null;
}

export type WarrantyBucket = "in" | "out" | "unknown";

export interface ClaimTrackingKpis {
  month: string;
  total: number;
  in_warranty: number;
  out_warranty: number;
  unknown_warranty: number;
  closed: number;
  factory_recorded: number;
  month_value: number;
  recorded_value: number;
  missing_serial: number;
  missing_symptom: number;
}

export interface ClaimTrackingRow {
  id: string;
  task_number: string;
  status: string | null;
  is_closed: boolean;
  sku: string | null;
  product_name: string | null;
  product_serial: string | null;
  issue_description: string | null;
  issue_group: string | null;
  create_date: string | null;
  timestamp: number | null;
  warranty_start_date: string | null;
  days_from_register: number | null;
  warranty_bucket: WarrantyBucket;
  missing_serial: boolean;
  missing_symptom: boolean;
  factory_recorded: boolean;
  recorded_amount: number | null;
  unit_cost: number | null;
  match_tier: PoMatchTier | null;
}

export interface ClaimTrackingData {
  kpis: ClaimTrackingKpis;
  rows: ClaimTrackingRow[];
  months: string[];
}
