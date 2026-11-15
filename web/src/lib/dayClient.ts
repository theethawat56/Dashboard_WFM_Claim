import type { TaskRow } from "@/app/dashboard/_components/TaskListTable";
import { bangkokDate } from "./bangkokDate";

const STARTED_KEY = "wfm_day_started";
const DRAFT_KEY = "wfm_claimed_draft";

export function getStartedDate(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STARTED_KEY);
}

export function markDayStarted(date = bangkokDate()): void {
  window.localStorage.setItem(STARTED_KEY, date);
}

export function clearDayStarted(): void {
  window.localStorage.removeItem(STARTED_KEY);
}

export function saveClaimedDraft(tasks: TaskRow[], date = bangkokDate()): void {
  window.localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({ date, tasks })
  );
}

export function loadClaimedDraft(date = bangkokDate()): TaskRow[] {
  const raw = window.localStorage.getItem(DRAFT_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { date?: string; tasks?: TaskRow[] };
    if (parsed.date !== date || !Array.isArray(parsed.tasks)) return [];
    return parsed.tasks;
  } catch {
    return [];
  }
}
