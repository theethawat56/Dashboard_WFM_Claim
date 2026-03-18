import { db } from "./db";
import { ensureNewColumns } from "./migrate";
import { fetchBothWorkflows, fetchSkuBatch } from "./api";
import { upsertTasks } from "./upsert";
import type { Task } from "./types";

function toISO(date: Date): string {
  return date.toISOString();
}

/** Jan 1st of last year 00:00:00 UTC as Unix ms */
export function getHistoricalCutoffMs(): number {
  const now = new Date();
  const year = now.getUTCFullYear() - 1;
  return Date.UTC(year, 0, 1, 0, 0, 0, 0);
}

/** First day of current month 00:00:00 UTC as Unix ms */
export function getDailyCutoffMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0);
}

export async function hasSuccessfulHistoricalSync(): Promise<boolean> {
  const r = await db.execute({
    sql: `SELECT 1 FROM sync_log WHERE sync_type = ? AND status = ? LIMIT 1`,
    args: ["historical", "success"],
  });
  return r.rows.length > 0;
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
    const sku = skuMap.get(id) ?? "";
    if (sku !== "") {
      fetched++;
    }
  }
  const failed = uniqueIds.length - fetched;
  return { fetched, failed };
}

export async function runHistoricalSync(): Promise<void> {
  await ensureNewColumns();
  const force = process.env.FORCE_HISTORICAL === "true";
  if (!force) {
    const done = await hasSuccessfulHistoricalSync();
    if (done) {
      console.warn(
        "[sync] Historical sync already completed. Set FORCE_HISTORICAL=true to run again."
      );
      return;
    }
  }

  const startedAt = toISO(new Date());
  const cutoff = getHistoricalCutoffMs();
  let repairFetched = 0;
  let claimFetched = 0;
  let totalUpserted = 0;
  let skuFetched = 0;
  let skuFailed = 0;

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

    const finishedAt = toISO(new Date());
    await db.execute({
      sql: `INSERT INTO sync_log (
        sync_type, workflow_ids, started_at, finished_at,
        repair_fetched, claim_fetched, total_upserted, status,
        sku_fetched, sku_failed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "historical",
        "ulMEhA,OC8LiE",
        startedAt,
        finishedAt,
        repairFetched,
        claimFetched,
        totalUpserted,
        "success",
        skuFetched,
        skuFailed,
      ],
    });
    console.log(
      `[sync] Historical sync done. repair=${repairFetched} claim=${claimFetched} upserted=${totalUpserted} sku_fetched=${skuFetched} sku_failed=${skuFailed}`
    );
  } catch (err) {
    const finishedAt = toISO(new Date());
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db.execute({
      sql: `INSERT INTO sync_log (
        sync_type, workflow_ids, started_at, finished_at,
        repair_fetched, claim_fetched, total_upserted, status, error_message,
        sku_fetched, sku_failed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "historical",
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
      ],
    });
    console.error("[sync] Historical sync failed:", errorMessage);
    throw err;
  }
}

export async function runDailySync(): Promise<void> {
  await ensureNewColumns();
  const startedAt = toISO(new Date());
  const cutoff = getDailyCutoffMs();
  let repairFetched = 0;
  let claimFetched = 0;
  let totalUpserted = 0;
  let skuFetched = 0;
  let skuFailed = 0;

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

    const finishedAt = toISO(new Date());
    await db.execute({
      sql: `INSERT INTO sync_log (
        sync_type, workflow_ids, started_at, finished_at,
        repair_fetched, claim_fetched, total_upserted, status,
        sku_fetched, sku_failed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ],
    });
    console.log(
      `[sync] Daily sync done. repair=${repairFetched} claim=${claimFetched} upserted=${totalUpserted} sku_fetched=${skuFetched} sku_failed=${skuFailed}`
    );
  } catch (err) {
    const finishedAt = toISO(new Date());
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db.execute({
      sql: `INSERT INTO sync_log (
        sync_type, workflow_ids, started_at, finished_at,
        repair_fetched, claim_fetched, total_upserted, status, error_message,
        sku_fetched, sku_failed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ],
    });
    console.error("[sync] Daily sync failed:", errorMessage);
    throw err;
  }
}

if (require.main === module) {
  runHistoricalSync()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
