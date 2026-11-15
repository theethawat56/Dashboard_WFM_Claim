export function bangkokToday(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

export function thisYearRange(d = new Date()): { year: number; from: string; to: string } {
  const today = bangkokToday(d);
  const year = Number(today.slice(0, 4));
  return { year, from: `${year}-01-01`, to: today };
}

export function isMondayBangkok(d = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
  }).format(d);
  return weekday === "Mon";
}
