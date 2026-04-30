import { getDb } from "../db";
import { fetchBothWorkflows, fetchSkuBatch } from "./api";
import { upsertTasks } from "./upsert";
import { fetchWarrantyForPendingTasks } from "./warranty";
import type { Task } from "./types";

function toISO(date: Date): string {
  return date.toISOString();
}

function getDailyCutoffMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0);
}

function getRecentCutoffMs(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function collectProductIds(tasks: Task[]): string[] {
  const ids = new Set<string>();
  for (const t of tasks) {
    const detail = t.detail as any;
    const productInfo = detail?.productInfo ?? detail?.product_info;
    const id = (productInfo?.id as string | undefined) ?? "";
    if (id && id.trim() !== "") {
      ids.add(id);
    }
  }
  return Array.from(ids);
}

function computeSkuStats(
  productIds: string[],
  skuMap: Map<string, string>
): { fetched: number; failed: number } {
  const uniqueIds = Array.from(new Set(productIds));
  let fetched = 0;
  for (const id of uniqueIds) {
    if ((skuMap.get(id) ?? "") !== "") fetched++;
  }
  return { fetched, failed: uniqueIds.length - fetched };
}

export interface SyncResult {
  repairFetched: number;
  claimFetched: number;
  totalUpserted: number;
  skuFetched: number;
  skuFailed: number;
  warrantyFetched: number;
  warrantyFailed: number;
}

export async function runDailySync(): Promise<SyncResult> {
  const db = getDb();
  const startedAt = toISO(new Date());
  const cutoff = getDailyCutoffMs();
  let repairFetched = 0;
  let claimFetched = 0;
  let totalUpserted = 0;
  let skuFetched = 0;
  let skuFailed = 0;
  let warrantyFetched = 0;
  let warrantyFailed = 0;

  try {
    const { repair, claim } = await fetchBothWorkflows(cutoff);
    repairFetched = repair.length;
    claimFetched = claim.length;

    const allTasks: Task[] = [...repair, ...claim];
    const productIds = collectProductIds(allTasks);
    const skuMap = await fetchSkuBatch(productIds);
    const stats = computeSkuStats(productIds, skuMap);
    skuFetched = stats.fetched;
    skuFailed = stats.failed;

    totalUpserted += await upsertTasks(repair, "repair", skuMap);
    totalUpserted += await upsertTasks(claim, "claim", skuMap);

    try {
      const w = await fetchWarrantyForPendingTasks({ onlyMissing: true });
      warrantyFetched = w.fetched;
      warrantyFailed = w.failed + w.skipped;
    } catch (wErr) {
      console.warn(
        "[sync] Warranty fetch failed (non-fatal):",
        wErr instanceof Error ? wErr.message : String(wErr)
      );
    }

    const finishedAt = toISO(new Date());
    await db.execute({
      sql: `INSERT INTO sync_log (
        sync_type, workflow_ids, started_at, finished_at,
        repair_fetched, claim_fetched, total_upserted, status,
        sku_fetched, sku_failed, warranty_fetched, warranty_failed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "daily",
        "ulMEhA,OC8LiE",
        startedAt,
        finishedAt,
        repairFetched,
        claimFetched,
        totalUpserted,
        "success",
        skuFetched,
        skuFailed,
        warrantyFetched,
        warrantyFailed,
      ],
    });

    console.log(
      `[sync] Daily sync done. repair=${repairFetched} claim=${claimFetched} upserted=${totalUpserted} sku_fetched=${skuFetched} sku_failed=${skuFailed} warranty_fetched=${warrantyFetched} warranty_failed=${warrantyFailed}`
    );

    return {
      repairFetched,
      claimFetched,
      totalUpserted,
      skuFetched,
      skuFailed,
      warrantyFetched,
      warrantyFailed,
    };
  } catch (err) {
    const finishedAt = toISO(new Date());
    const errorMessage = err instanceof Error ? err.message : String(err);
    try {
      await db.execute({
        sql: `INSERT INTO sync_log (
          sync_type, workflow_ids, started_at, finished_at,
          repair_fetched, claim_fetched, total_upserted, status, error_message,
          sku_fetched, sku_failed, warranty_fetched, warranty_failed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "daily",
          "ulMEhA,OC8LiE",
          startedAt,
          finishedAt,
          repairFetched,
          claimFetched,
          totalUpserted,
          "error",
          errorMessage,
          skuFetched,
          skuFailed,
          warrantyFetched,
          warrantyFailed,
        ],
      });
    } catch (logErr) {
      console.error("[sync] Failed to log sync error:", logErr);
    }
    console.error("[sync] Daily sync failed:", errorMessage);
    throw err;
  }
}

export async function runRecentSync(days: number = 30): Promise<SyncResult> {
  const db = getDb();
  const startedAt = toISO(new Date());
  const cutoff = getRecentCutoffMs(days);
  let repairFetched = 0;
  let claimFetched = 0;
  let totalUpserted = 0;
  let skuFetched = 0;
  let skuFailed = 0;
  let warrantyFetched = 0;
  let warrantyFailed = 0;

  try {
    const { repair, claim } = await fetchBothWorkflows(cutoff);
    repairFetched = repair.length;
    claimFetched = claim.length;

    const allTasks: Task[] = [...repair, ...claim];
    const productIds = collectProductIds(allTasks);
    const skuMap = await fetchSkuBatch(productIds);
    const stats = computeSkuStats(productIds, skuMap);
    skuFetched = stats.fetched;
    skuFailed = stats.failed;

    totalUpserted += await upsertTasks(repair, "repair", skuMap);
    totalUpserted += await upsertTasks(claim, "claim", skuMap);

    try {
      const w = await fetchWarrantyForPendingTasks({ onlyMissing: true });
      warrantyFetched = w.fetched;
      warrantyFailed = w.failed + w.skipped;
    } catch (wErr) {
      console.warn(
        "[sync] Warranty fetch failed (non-fatal):",
        wErr instanceof Error ? wErr.message : String(wErr)
      );
    }

    const finishedAt = toISO(new Date());
    await db.execute({
      sql: `INSERT INTO sync_log (
        sync_type, workflow_ids, started_at, finished_at,
        repair_fetched, claim_fetched, total_upserted, status,
        sku_fetched, sku_failed, warranty_fetched, warranty_failed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        `resync-${days}d`,
        "ulMEhA,OC8LiE",
        startedAt,
        finishedAt,
        repairFetched,
        claimFetched,
        totalUpserted,
        "success",
        skuFetched,
        skuFailed,
        warrantyFetched,
        warrantyFailed,
      ],
    });

    console.log(
      `[sync] Recent ${days}d sync done. repair=${repairFetched} claim=${claimFetched} upserted=${totalUpserted} sku_fetched=${skuFetched} sku_failed=${skuFailed} warranty_fetched=${warrantyFetched} warranty_failed=${warrantyFailed}`
    );

    return {
      repairFetched,
      claimFetched,
      totalUpserted,
      skuFetched,
      skuFailed,
      warrantyFetched,
      warrantyFailed,
    };
  } catch (err) {
    const finishedAt = toISO(new Date());
    const errorMessage = err instanceof Error ? err.message : String(err);
    try {
      await db.execute({
        sql: `INSERT INTO sync_log (
          sync_type, workflow_ids, started_at, finished_at,
          repair_fetched, claim_fetched, total_upserted, status, error_message,
          sku_fetched, sku_failed, warranty_fetched, warranty_failed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `resync-${days}d`,
          "ulMEhA,OC8LiE",
          startedAt,
          finishedAt,
          repairFetched,
          claimFetched,
          totalUpserted,
          "error",
          errorMessage,
          skuFetched,
          skuFailed,
          warrantyFetched,
          warrantyFailed,
        ],
      });
    } catch (logErr) {
      console.error("[sync] Failed to log sync error:", logErr);
    }
    console.error(`[sync] Recent ${days}d sync failed:`, errorMessage);
    throw err;
  }
}
