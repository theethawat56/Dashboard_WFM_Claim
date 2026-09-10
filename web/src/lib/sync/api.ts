import type { Task, SearchResponse } from "./types";

const SEARCH_URL = "https://open-api.dataslot.app/search/wfm/v1/RobotMaker";
const PRODUCT_BASE_URL = "https://api.dataslot.app/inventories/RobotMaker/products";

export const WORKFLOWS = {
  repair: { id: "ulMEhA", label: "repair" as const },
  claim: { id: "OC8LiE", label: "claim" as const },
} as const;

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const SKU_BATCH_SIZE = 50;
const SKU_BATCH_DELAY_MS = 300;
const HITS_PER_PAGE = 100;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postWithRetry(
  body: Record<string, unknown>
): Promise<SearchResponse> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        return (await res.json()) as SearchResponse;
      }
      if (res.status >= 500) {
        throw new Error(`API 5xx: ${res.status} ${res.statusText}`);
      }
      throw new Error(`API error: ${res.status} ${res.statusText}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await sleep(backoff);
      }
    }
  }
  throw lastError ?? new Error("Request failed after retries");
}

function taskCutoffTs(task: Task, useUpdated: boolean): number | null {
  if (useUpdated) {
    const updated = task.updatedTimestamp ?? task.updated_timestamp;
    if (updated != null) return Number(updated);
  }
  const ts = task.timestamp ?? task.updatedTimestamp ?? task.updated_timestamp;
  return ts != null ? Number(ts) : null;
}

export async function fetchAllPages(
  workflowId: string,
  timestampCutoff?: number,
  opts?: { statusFilter?: string; sort?: string; cutoffOnUpdated?: boolean }
): Promise<Task[]> {
  const all: Task[] = [];
  let page = 1;
  let nbPages: number | undefined;
  const statusFilter = opts?.statusFilter ?? "status != VOIDED";
  const sort = opts?.sort ?? "timestamp:desc";
  const useUpdated = opts?.cutoffOnUpdated === true;

  do {
    const body = {
      hitsPerPage: HITS_PER_PAGE,
      page,
      filter: [
        "company = RobotMaker",
        `workflowId IN ["${workflowId}"]`,
        "type = TASK",
        statusFilter,
      ],
      sort: [sort],
    };

    const data = await postWithRetry(body);
    const raw = data as SearchResponse & { estimatedTotalHits?: number };
    const nbHits =
      typeof raw.nbHits === "number"
        ? raw.nbHits
        : typeof raw.estimatedTotalHits === "number"
          ? raw.estimatedTotalHits
          : 0;
    const rawNbPages = raw.nbPages;
    if (typeof rawNbPages === "number" && rawNbPages >= 1) {
      nbPages = rawNbPages;
    } else {
      nbPages = nbHits > 0 ? Math.ceil(nbHits / HITS_PER_PAGE) : 1;
    }
    const hits = data.hits ?? [];

    console.log(
      `[API] workflowId=${workflowId} page=${page}/${nbPages} hits=${hits.length}`
    );

    for (const hit of hits) {
      const ts = taskCutoffTs(hit, useUpdated);
      if (timestampCutoff != null && ts != null && ts < timestampCutoff) {
        return all.filter((t) => {
          const tts = taskCutoffTs(t, useUpdated);
          return tts != null && tts >= timestampCutoff;
        });
      }
      all.push(hit);
    }

    if (timestampCutoff != null && hits.length > 0) {
      const lastTs = taskCutoffTs(hits[hits.length - 1], useUpdated);
      if (lastTs != null && lastTs < timestampCutoff) {
        return all.filter((t) => {
          const tts = taskCutoffTs(t, useUpdated);
          return tts != null && tts >= timestampCutoff;
        });
      }
    }

    page++;
    if (hits.length < HITS_PER_PAGE) break;
  } while (page <= nbPages);

  if (timestampCutoff != null) {
    return all.filter((t) => {
      const ts = taskCutoffTs(t, useUpdated);
      return ts != null && ts >= timestampCutoff;
    });
  }
  return all;
}

function mergeTasks(primary: Task[], extra: Task[]): Task[] {
  const map = new Map<string, Task>();
  for (const t of primary) {
    if (t.id) map.set(t.id, t);
  }
  for (const t of extra) {
    if (t.id) map.set(t.id, t);
  }
  return [...map.values()];
}

export async function fetchBothWorkflows(
  timestampCutoff?: number
): Promise<{ repair: Task[]; claim: Task[] }> {
  const voidedOpts = {
    statusFilter: "status = VOIDED",
    sort: "updatedTimestamp:desc",
    cutoffOnUpdated: true,
  };
  const [repair, claim, repairVoided, claimVoided] = await Promise.all([
    fetchAllPages(WORKFLOWS.repair.id, timestampCutoff),
    fetchAllPages(WORKFLOWS.claim.id, timestampCutoff),
    fetchAllPages(WORKFLOWS.repair.id, timestampCutoff, voidedOpts),
    fetchAllPages(WORKFLOWS.claim.id, timestampCutoff, voidedOpts),
  ]);
  return {
    repair: mergeTasks(repair, repairVoided),
    claim: mergeTasks(claim, claimVoided),
  };
}

export async function fetchSkuBatch(
  productIds: string[]
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(
    new Set(productIds.filter((id) => id && id.trim() !== ""))
  );
  const result = new Map<string, string>();

  const fetchSkuForId = async (productId: string): Promise<void> => {
    const url = `${PRODUCT_BASE_URL}/${encodeURIComponent(productId)}`;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        console.warn(
          `[API] SKU fetch failed for productId=${productId} status=${res.status}`
        );
        result.set(productId, "");
        return;
      }
      const json = (await res.json()) as { data?: { sku?: string } };
      result.set(productId, json.data?.sku ?? "");
    } catch (err) {
      console.warn(
        `[API] SKU fetch error for productId=${productId}:`,
        err instanceof Error ? err.message : String(err)
      );
      result.set(productId, "");
    }
  };

  for (let i = 0; i < uniqueIds.length; i += SKU_BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + SKU_BATCH_SIZE);
    await Promise.all(batch.map((id) => fetchSkuForId(id)));
    if (i + SKU_BATCH_SIZE < uniqueIds.length) {
      await sleep(SKU_BATCH_DELAY_MS);
    }
  }

  return result;
}
