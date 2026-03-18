import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Thai number formatting with thousand separator */
export function formatThaiNumber(n: number): string {
  return n.toLocaleString("th-TH");
}

/** Format date as DD/MM/YYYY */
export function formatDateThai(isoOrTimestamp: string | number | null | undefined): string {
  if (isoOrTimestamp == null) return "-";
  const d =
    typeof isoOrTimestamp === "number"
      ? new Date(isoOrTimestamp)
      : new Date(isoOrTimestamp);
  if (Number.isNaN(d.getTime())) return "-";
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}
