/** WFM cancelled / voided tasks — hide everywhere and mark on sync. */
export const VOIDED_STATUS = "VOIDED";

export const SQL_NOT_VOIDED = "t.status != 'VOIDED'";

/** Repair workflow ulMEhA completed. */
export const REPAIR_CLOSED_STATUS = "SUCCESS";

/** Claim workflow OC8LiE closed / returned. */
export const CLAIM_CLOSED_STATUS = "HRXLwh";

export function isTaskClosed(
  taskType: "repair" | "claim" | string | null,
  status: string | null
): boolean {
  if (!status) return false;
  if (taskType === "repair") return status === REPAIR_CLOSED_STATUS;
  return status === CLAIM_CLOSED_STATUS;
}
