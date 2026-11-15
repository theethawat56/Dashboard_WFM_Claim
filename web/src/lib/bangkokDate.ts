export function bangkokDate(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

/** Shift a YYYY-MM-DD date by whole days, independent of the machine timezone. */
export function shiftIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Inclusive window ending on `endDate`, covering `days` calendar days. */
export function lookbackRange(
  endDate: string,
  days: number
): { from: string; to: string } {
  const span = Math.max(1, days);
  return { from: shiftIsoDate(endDate, -(span - 1)), to: endDate };
}

export function formatThaiDate(isoDate: string): string {
  const [y, m, day] = isoDate.split("-").map(Number);
  if (!y || !m || !day) return isoDate;
  return new Date(y, m - 1, day).toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
