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
  // Customer / warranty identifiers may live at task root in some payloads
  customerGUId?: string;
  customer_g_uid?: string;
  customer_guid?: string;
  customerGuid?: string;
  warrantyId?: string;
  warranty_id?: string;
  detail?: {
    customerName?: string;
    customer_name?: string;
    customerPhone?: string;
    customer_phone?: string;
    customerProvince?: string;
    customer_province?: string;
    customerGUId?: string;
    customer_g_uid?: string;
    customer_guid?: string;
    customerGuid?: string;
    customerInfo?: {
      gUId?: string;
      guid?: string;
      id?: string;
    };
    customer_info?: {
      gUId?: string;
      guid?: string;
      id?: string;
    };
    warrantyId?: string;
    warranty_id?: string;
    warrantyInfo?: {
      warrantyId?: string;
      id?: string;
    };
    warranty_info?: {
      warrantyId?: string;
      id?: string;
    };
    productInfo?: {
      description?: string;
      model?: string;
      serial?: string;
      id?: string;
      sku?: string;
      issueGroup?: string;
      claimType?: string;
      warrantyId?: string;
    };
    product_info?: {
      description?: string;
      model?: string;
      serial?: string;
      id?: string;
      sku?: string;
      issueGroup?: string;
      claimType?: string;
      warrantyId?: string;
    };
    taskInfo?: {
      refNumbers?: string[];
      ref_numbers?: string[];
      warrantyId?: string;
      createDate?: string;
      create_date?: string;
    };
    task_info?: {
      refNumbers?: string[];
      ref_numbers?: string[];
      warrantyId?: string;
      createDate?: string;
      create_date?: string;
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
