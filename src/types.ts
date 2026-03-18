/**
 * Task hit from search API (field names may be camelCase from API).
 */
export interface Task {
  id: string;
  taskNumber?: string;
  task_number?: string;
  workflowId?: string;
  workflow_id?: string;
  status?: string;
  company?: string;
  timestamp?: number;
  updatedTimestamp?: number;
  updated_timestamp?: number;
  detail?: {
    customerName?: string;
    customer_name?: string;
    customerPhone?: string;
    customer_phone?: string;
    customerProvince?: string;
    customer_province?: string;
    productInfo?: {
      description?: string;
      model?: string;
      serial?: string;
    };
    product_info?: {
      description?: string;
      model?: string;
      serial?: string;
    };
    taskInfo?: {
      refNumbers?: string[];
      ref_numbers?: string[];
    };
    task_info?: {
      refNumbers?: string[];
      ref_numbers?: string[];
    };
    shippingOption?: string;
    shipping_option?: string;
    createDate?: string;
    create_date?: string;
    parentIds?: string[];
    parent_ids?: string[];
  };
}

export interface SearchResponse {
  hits: Task[];
  nbHits: number;
  page: number;
  nbPages: number;
}
