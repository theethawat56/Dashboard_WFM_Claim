export const COMP_TYPES = [
  { value: "cost_refund", label: "Cost refund" },
  { value: "spare_parts", label: "Spare parts" },
  { value: "deduce", label: "Deduct from the next order" },
  { value: "replacement", label: "Replacement unit" },
] as const;

export type CompType = (typeof COMP_TYPES)[number]["value"];

export type CaseStatus = "waiting" | "proposed" | "rejected" | "returned" | "confirmed";

export function isCompType(value: string): value is CompType {
  return COMP_TYPES.some((item) => item.value === value);
}
