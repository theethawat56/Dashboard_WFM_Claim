/** Shift warranty start earlier so displayed coverage begins 14 days before registration. */
export const WARRANTY_START_BUFFER_DAYS = 14;

/** A job stays in warranty through this many days after the shifted start. */
export const WARRANTY_LIMIT_DAYS = 365;

export function sqlShiftedWarrantyDate(
  column = "td.warranty_start_date"
): string {
  return `CASE
    WHEN ${column} IS NOT NULL AND TRIM(${column}) != ''
    THEN date(substr(${column}, 1, 10), '-${WARRANTY_START_BUFFER_DAYS} days')
    ELSE NULL
  END`;
}

/** Age in days from the shifted warranty start (or stored days plus the buffer). */
export function sqlDaysToRepairExpr(
  timestampCol = "t.timestamp",
  warrantyDateCol = "td.warranty_start_date",
  storedDaysCol = "td.days_to_repair"
): string {
  const shifted = sqlShiftedWarrantyDate(warrantyDateCol);
  return `CASE
    WHEN ${warrantyDateCol} IS NOT NULL AND TRIM(${warrantyDateCol}) != ''
    THEN CAST(
      julianday(date(datetime(${timestampCol} / 1000, 'unixepoch', '+7 hours')))
      - julianday(${shifted})
    AS INTEGER)
    WHEN ${storedDaysCol} IS NOT NULL
    THEN ${storedDaysCol} + ${WARRANTY_START_BUFFER_DAYS}
    ELSE NULL
  END`;
}

/** Dashboard rule: a dated age of 365 days or less, including negative ages. */
export function sqlInWarranty(
  timestampCol = "t.timestamp",
  warrantyDateCol = "td.warranty_start_date",
  storedDaysCol = "td.days_to_repair"
): string {
  const days = `(${sqlDaysToRepairExpr(timestampCol, warrantyDateCol, storedDaysCol)})`;
  return `${days} IS NOT NULL AND ${days} <= ${WARRANTY_LIMIT_DAYS}`;
}

/** Keep a compensation batch when it still contains an in-warranty job. */
export function sqlBatchHasInWarrantyTask(batchIdExpr = "b.id"): string {
  return `EXISTS (
    SELECT 1
    FROM claim_comp_batch_tasks bt_w
    JOIN tasks t ON t.id = bt_w.task_id
    JOIN task_details td ON td.task_id = t.id
    WHERE bt_w.batch_id = ${batchIdExpr}
      AND t.status != 'VOIDED'
      AND ${sqlInWarranty()}
  )`;
}

export function shiftWarrantyStartDate(
  value: string | null | undefined
): string | null {
  const m = String(value ?? "")
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - WARRANTY_START_BUFFER_DAYS);
  return d.toISOString().slice(0, 10);
}
