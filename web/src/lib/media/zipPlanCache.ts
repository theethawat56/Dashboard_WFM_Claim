import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { MediaFile } from "./taskMedia";
import type { ZipPartPlan } from "./zipParts";

const TTL_MS = 30 * 60 * 1000;
const PLAN_DIR = join(tmpdir(), "wfm-zip-plans");
const PLAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StoredExportPlan {
  id: string;
  at: number;
  files: MediaFile[];
  parts: ZipPartPlan[];
}

function planPath(id: string): string | null {
  if (!PLAN_ID.test(id)) return null;
  return join(PLAN_DIR, `${id}.json`);
}

function prune(now = Date.now()): void {
  let names: string[] = [];
  try {
    names = readdirSync(PLAN_DIR);
  } catch {
    return;
  }
  for (const name of names) {
    const path = join(PLAN_DIR, name);
    try {
      if (now - statSync(path).mtimeMs > TTL_MS) unlinkSync(path);
    } catch {
      // A plan file can disappear between listing and deletion.
    }
  }
}

/** Persist the plan on disk so the download request can find it after a dev-server reload. */
export function storeExportPlan(files: MediaFile[], parts: ZipPartPlan[]): string {
  mkdirSync(PLAN_DIR, { recursive: true });
  prune();
  const id = randomUUID();
  const stored: StoredExportPlan = { id, at: Date.now(), files, parts };
  writeFileSync(planPath(id) as string, JSON.stringify(stored));
  return id;
}

export function loadExportPlan(id: string): StoredExportPlan | null {
  const path = planPath(id);
  if (!path) return null;
  try {
    const stored = JSON.parse(readFileSync(path, "utf8")) as StoredExportPlan;
    if (!stored?.id || stored.id !== id || !Array.isArray(stored.files) || !Array.isArray(stored.parts)) {
      return null;
    }
    if (Date.now() - stored.at > TTL_MS) {
      unlinkSync(path);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}
