export interface TaskRow {
  id: string;
  task_number: string;
  task_type: "repair" | "claim";
  workflow_id: string | null;
  status: string | null;
  company: string | null;
  timestamp: number | null;
  updated_timestamp: number | null;
  is_reclaim: number;
  is_unfixed: number;
  parent_ids: string | null;
  created_at: string | null;
}

export interface TaskDetailsRow {
  task_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_province: string | null;
  product_model: string | null;
  product_serial: string | null;
  issue_description: string | null;
  shipping_option: string | null;
  create_date: string | null;
  ref_numbers: string | null;
  sku: string | null;
  issue_group: string | null;
  is_reclaim: number;
  ref_task_numbers: string | null;
  claim_type: string | null;
}

export interface SyncLogRow {
  id: number;
  sync_type: string | null;
  started_at: string | null;
  finished_at: string | null;
  repair_fetched: number | null;
  claim_fetched: number | null;
  total_upserted: number | null;
  status: string | null;
  error_message: string | null;
  sku_fetched: number | null;
  sku_failed: number | null;
}
