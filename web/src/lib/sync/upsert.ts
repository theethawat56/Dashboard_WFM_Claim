import { getDb } from "../db";
import type { Task } from "./types";

const UNFIXED_PATTERNS = [
  "ซ่อมไม่หาย",
  "ไม่หาย",
  "ใช้งานไม่ได้",
  "แก้ไขแล้วไม่หาย",
];

function getTaskNumber(task: Task): string {
  return (task.task_number ?? task.taskNumber ?? task.id ?? "").toString();
}

function getWorkflowId(task: Task): string | null {
  return task.workflow_id ?? task.workflowId ?? null;
}

function getTimestamp(task: Task): number | null {
  const ts = task.timestamp ?? task.updatedTimestamp ?? task.updated_timestamp;
  return ts != null ? Number(ts) : null;
}

function getParentIds(task: Task): string[] {
  const detail = task.detail;
  if (!detail) return [];
  const arr = detail.parentIds ?? detail.parent_ids;
  return Array.isArray(arr) ? arr : [];
}

function getRefNumbers(task: Task): string[] {
  const detail = task.detail;
  if (!detail) return [];
  const info = detail.taskInfo ?? detail.task_info;
  if (!info) return [];
  const arr = info.refNumbers ?? info.ref_numbers;
  return Array.isArray(arr) ? arr : [];
}

function isReclaim(task: Task): boolean {
  const parentIds = getParentIds(task);
  const refNumbers = getRefNumbers(task);
  return parentIds.length > 0 || refNumbers.length > 0;
}

function isUnfixed(task: Task): boolean {
  const detail = task.detail;
  if (!detail) return false;
  const productInfo = detail.productInfo ?? detail.product_info;
  const description = (productInfo?.description ?? "").toString() || "";
  return UNFIXED_PATTERNS.some((p) => description.includes(p));
}

function getProductInfo(task: Task): Record<string, unknown> | null {
  const detail = task.detail;
  if (!detail) return null;
  return (detail as any).productInfo ?? (detail as any).product_info ?? null;
}

function getProductModel(task: Task): string | null {
  const info = getProductInfo(task);
  return (info?.model as string | undefined) ?? null;
}

function getProductSerial(task: Task): string | null {
  const info = getProductInfo(task);
  return (info?.serial as string | undefined) ?? null;
}

function getIssueDescription(task: Task): string | null {
  const info = getProductInfo(task);
  return (info?.description as string | undefined) ?? null;
}

function getIssueGroup(task: Task): string {
  const info = getProductInfo(task);
  return (info?.issueGroup as string | undefined) ?? "";
}

function getClaimType(task: Task, taskType: "repair" | "claim"): string {
  if (taskType !== "claim") return "";
  const info = getProductInfo(task);
  return (info?.claimType as string | undefined) ?? "";
}

function getRefTaskNumbers(task: Task): string {
  const detail = task.detail;
  if (!detail) return "";
  const info = detail.taskInfo ?? detail.task_info;
  if (!info) return "";
  const arr = info.refNumbers ?? info.ref_numbers;
  if (!Array.isArray(arr) || arr.length === 0) return "";
  return arr.join(", ");
}

function getProductId(task: Task): string | null {
  const info = getProductInfo(task);
  const value = (info?.id as string | undefined) ?? "";
  return value || null;
}

function pickFirstString(...values: Array<unknown>): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

function getCustomerGUId(task: Task): string | null {
  const taskRec = task as unknown as Record<string, unknown>;
  const detail = task.detail as Record<string, unknown> | undefined;
  const customerInfo =
    (detail?.customerInfo as Record<string, unknown> | undefined) ??
    (detail?.customer_info as Record<string, unknown> | undefined);
  return pickFirstString(
    taskRec.customerGUId,
    taskRec.customer_g_uid,
    taskRec.customer_guid,
    taskRec.customerGuid,
    detail?.customerGUId,
    detail?.customer_g_uid,
    detail?.customer_guid,
    detail?.customerGuid,
    customerInfo?.gUId,
    customerInfo?.guid,
    customerInfo?.id
  );
}

function getWarrantyId(task: Task): string | null {
  const taskRec = task as unknown as Record<string, unknown>;
  const detail = task.detail as Record<string, unknown> | undefined;
  const warrantyInfo =
    (detail?.warrantyInfo as Record<string, unknown> | undefined) ??
    (detail?.warranty_info as Record<string, unknown> | undefined);
  const productInfo = getProductInfo(task) as Record<string, unknown> | null;
  const taskInfo =
    (detail?.taskInfo as Record<string, unknown> | undefined) ??
    (detail?.task_info as Record<string, unknown> | undefined);
  return pickFirstString(
    taskRec.warrantyId,
    taskRec.warranty_id,
    detail?.warrantyId,
    detail?.warranty_id,
    warrantyInfo?.warrantyId,
    warrantyInfo?.id,
    productInfo?.warrantyId,
    taskInfo?.warrantyId
  );
}

function tsToIsoDate(ts: number | null): string | null {
  if (ts == null || !Number.isFinite(ts)) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function upsertTasks(
  tasks: Task[],
  taskType: "repair" | "claim",
  skuMap: Map<string, string>
): Promise<number> {
  if (tasks.length === 0) return 0;
  const db = getDb();

  let upserted = 0;
  for (const task of tasks) {
    const id = task.id;
    if (!id) continue;

    const taskNumber = getTaskNumber(task);
    const workflowId = getWorkflowId(task);
    const timestamp = getTimestamp(task);
    const updatedTs = task.updated_timestamp ?? task.updatedTimestamp ?? null;
    const parentIds = getParentIds(task);
    const refNumbers = getRefNumbers(task);
    const isReclaimFlag = isReclaim(task) ? 1 : 0;

    const createdAt = new Date().toISOString();
    await db.execute({
      sql: `INSERT OR REPLACE INTO tasks (
        id, task_number, task_type, workflow_id, status, company,
        timestamp, updated_timestamp, is_reclaim, is_unfixed, parent_ids, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        taskNumber,
        taskType,
        workflowId,
        task.status ?? null,
        task.company ?? null,
        timestamp,
        updatedTs != null ? Number(updatedTs) : null,
        isReclaimFlag,
        isUnfixed(task) ? 1 : 0,
        parentIds.length > 0 ? JSON.stringify(parentIds) : null,
        createdAt,
      ],
    });

    const detail = task.detail;
    const customerName = detail?.customer_name ?? detail?.customerName ?? null;
    const customerPhone = detail?.customer_phone ?? detail?.customerPhone ?? null;
    const customerProvince = detail?.customer_province ?? detail?.customerProvince ?? null;
    const shippingOption = detail?.shipping_option ?? detail?.shippingOption ?? null;
    // Prefer explicit detail.create_date, fall back to nested taskInfo.createDate, then to the
    // task timestamp formatted as YYYY-MM-DD so the column is never empty in exports.
    const taskInfoForDate =
      (detail?.taskInfo as { createDate?: string; create_date?: string } | undefined) ??
      (detail?.task_info as { createDate?: string; create_date?: string } | undefined);
    const createDate =
      detail?.create_date ??
      detail?.createDate ??
      taskInfoForDate?.create_date ??
      taskInfoForDate?.createDate ??
      tsToIsoDate(timestamp) ??
      null;

    const customerGuid = getCustomerGUId(task);
    const warrantyId = getWarrantyId(task);

    const productId = getProductId(task);
    const sku = productId ? skuMap.get(productId) ?? "" : "";
    const issueGroup = getIssueGroup(task);
    const refTaskNumbers = getRefTaskNumbers(task);
    const claimType = getClaimType(task, taskType);

    await db.execute({
      sql: `INSERT OR REPLACE INTO task_details (
        task_id, customer_name, customer_phone, customer_province,
        product_model, product_serial, issue_description, shipping_option,
        create_date, ref_numbers,
        sku, issue_group, is_reclaim, ref_task_numbers, claim_type,
        customer_guid, warranty_id,
        warranty_start_date, warranty_start_ts, warranty_period,
        warranty_order_number, warranty_serial, days_to_repair
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        COALESCE((SELECT warranty_start_date FROM task_details WHERE task_id = ?), NULL),
        COALESCE((SELECT warranty_start_ts FROM task_details WHERE task_id = ?), NULL),
        COALESCE((SELECT warranty_period FROM task_details WHERE task_id = ?), NULL),
        COALESCE((SELECT warranty_order_number FROM task_details WHERE task_id = ?), NULL),
        COALESCE((SELECT warranty_serial FROM task_details WHERE task_id = ?), NULL),
        COALESCE((SELECT days_to_repair FROM task_details WHERE task_id = ?), NULL)
      )`,
      args: [
        id,
        customerName,
        customerPhone,
        customerProvince,
        getProductModel(task),
        getProductSerial(task),
        getIssueDescription(task),
        shippingOption,
        createDate,
        refNumbers.length > 0 ? JSON.stringify(refNumbers) : null,
        sku || "",
        issueGroup,
        isReclaimFlag,
        refTaskNumbers,
        claimType,
        customerGuid,
        warrantyId,
        id,
        id,
        id,
        id,
        id,
        id,
      ],
    });

    upserted++;
  }

  return upserted;
}
