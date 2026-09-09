const THAI = /[\u0E00-\u0E7F]/;
const COMPANY =
  /\bco\.?\s*,?\s*ltd\.?|\blimited\b|\bpte\.?\s*ltd|\bcorporation\b|\bcorp\.?\b/i;
const JUNK = new Set(["foc", "test supplier", "harvey"]);

export function isFocText(...parts: Array<string | null | undefined>): boolean {
  const blob = parts
    .map((p) => (p ?? "").toLowerCase())
    .join(" ");
  return blob.includes("foc");
}

/** Foreign factory: Latin Co./Ltd/Limited/PTE/Corporation, excluding junk names. */
export function isForeignFactory(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  if (!n) return false;
  const lower = n.toLowerCase();
  if (JUNK.has(lower)) return false;
  if (THAI.test(n)) return false;
  return COMPANY.test(n);
}
