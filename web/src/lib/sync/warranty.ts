import { getDb } from "../db";

const WARRANTY_BASE_URL =
  "https://xsxx8bsz3d.execute-api.ap-southeast-1.amazonaws.com/prod/RobotMaker/customers";

const CHUNK_SIZE = 50;
const CHUNK_DELAY_MS = 400;
const REQUEST_TIMEOUT_MS = 15000;

export interface WarrantyFetchStats {
  fetched: number;
  failed: number;
  skipped: number;
}

interface PendingTask {
  task_id: string;
  customer_guid: string;
  warranty_id: string;
  task_timestamp: number | null;
}

interface WarrantyApiData {
  boughtTimestamp?: number;
  registeredTimestamp?: number;
  timestamp?: number;
  serialNumber?: string;
  value?: number | string;
  unit?: string;
  orderNumber?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatIsoDate(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateOnlyMs(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchOne(
  task: PendingTask
): Promise<{ data: WarrantyApiData | null; ok: boolean }> {
  const url = `${WARRANTY_BASE_URL}/${encodeURIComponent(
    task.customer_guid
  )}/warranties/${encodeURIComponent(task.warranty_id)}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      console.warn(
        `[warranty] HTTP ${res.status} for gUId=${task.customer_guid} warrantyId=${task.warranty_id}`
      );
      return { data: null, ok: false };
    }
    const json = (await res.json()) as { data?: WarrantyApiData };
    if (!json?.data) return { data: null, ok: false };
    return { data: json.data, ok: true };
  } catch (err) {
    console.warn(
      `[warranty] fetch error for gUId=${task.customer_guid} warrantyId=${task.warranty_id}:`,
      err instanceof Error ? err.message : String(err)
    );
    return { data: null, ok: false };
  }
}

/**
 * Fetch warranty start dates from the warranty API for tasks that have
 * customer_guid + warranty_id but no warranty_start_ts yet. Computes
 * days_to_repair = (task timestamp date) - (warranty start date) in days.
 *
 * Set onlyMissing=false to refresh existing warranty data as well.
 */
export async function fetchWarrantyForPendingTasks(
  options: { onlyMissing?: boolean; limit?: number } = {}
): Promise<WarrantyFetchStats> {
  const { onlyMissing = true, limit } = options;
  const db = getDb();

  const where = onlyMissing
    ? "td.customer_guid IS NOT NULL AND TRIM(td.customer_guid) != '' " +
      "AND td.warranty_id IS NOT NULL AND TRIM(td.warranty_id) != '' " +
      "AND (td.warranty_start_ts IS NULL OR td.warranty_start_ts = 0)"
    : "td.customer_guid IS NOT NULL AND TRIM(td.customer_guid) != '' " +
      "AND td.warranty_id IS NOT NULL AND TRIM(td.warranty_id) != ''";

  const limitClause = limit && limit > 0 ? `LIMIT ${Math.floor(limit)}` : "";

  const r = await db.execute(`
    SELECT td.task_id, td.customer_guid, td.warranty_id, t.timestamp AS task_timestamp
    FROM task_details td
    JOIN tasks t ON t.id = td.task_id
    WHERE ${where}
    ORDER BY t.timestamp DESC
    ${limitClause}
  `);

  const pending: PendingTask[] = r.rows.map((row: Record<string, unknown>) => ({
    task_id: String(row.task_id ?? ""),
    customer_guid: String(row.customer_guid ?? ""),
    warranty_id: String(row.warranty_id ?? ""),
    task_timestamp: row.task_timestamp != null ? Number(row.task_timestamp) : null,
  }));

  if (pending.length === 0) {
    console.log("[warranty] No pending tasks need warranty data.");
    return { fetched: 0, failed: 0, skipped: 0 };
  }

  console.log(`[warranty] Fetching warranty data for ${pending.length} tasks...`);

  let fetched = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
    const chunk = pending.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(chunk.map((p) => fetchOne(p)));

    for (let j = 0; j < chunk.length; j++) {
      const task = chunk[j];
      const { data, ok } = results[j];
      if (!ok || !data) {
        failed++;
        continue;
      }

      const startTs =
        (typeof data.boughtTimestamp === "number" && data.boughtTimestamp) ||
        (typeof data.registeredTimestamp === "number" && data.registeredTimestamp) ||
        (typeof data.timestamp === "number" && data.timestamp) ||
        null;

      if (!startTs || !Number.isFinite(startTs)) {
        skipped++;
        continue;
      }

      const startDate = formatIsoDate(startTs);
      let daysToRepair: number | null = null;
      if (task.task_timestamp != null && Number.isFinite(task.task_timestamp)) {
        const repairMs = dateOnlyMs(task.task_timestamp);
        const startMs = dateOnlyMs(startTs);
        daysToRepair = Math.round((repairMs - startMs) / 86_400_000);
      }

      const period =
        data.value != null && data.unit != null
          ? `${data.value} ${data.unit}`
          : data.value != null
            ? String(data.value)
            : null;

      try {
        await db.execute({
          sql: `UPDATE task_details
            SET warranty_start_date = ?,
                warranty_start_ts = ?,
                warranty_period = ?,
                warranty_order_number = ?,
                warranty_serial = ?,
                days_to_repair = ?
            WHERE task_id = ?`,
          args: [
            startDate,
            startTs,
            period,
            data.orderNumber ?? null,
            data.serialNumber ?? null,
            daysToRepair,
            task.task_id,
          ],
        });
        fetched++;
      } catch (err) {
        console.warn(
          `[warranty] DB update failed for task_id=${task.task_id}:`,
          err instanceof Error ? err.message : String(err)
        );
        failed++;
      }
    }

    if (i + CHUNK_SIZE < pending.length) {
      await sleep(CHUNK_DELAY_MS);
    }
  }

  console.log(
    `[warranty] Done. fetched=${fetched} failed=${failed} skipped=${skipped} total=${pending.length}`
  );

  return { fetched, failed, skipped };
}
