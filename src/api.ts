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
        const data = (await res.json()) as SearchResponse;
        return data;
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

/**
 * Fetch all pages for one workflow. If timestampCutoff is set (daily sync),
 * stop paginating when the last item on a page has timestamp < cutoff.
 */
export async function fetchAllPages(
  workflowId: string,
  timestampCutoff?: number
): Promise<Task[]> {
  const all: Task[] = [];
  let page = 1;
  let nbPages: number | undefined;

  do {
    const body = {
      hitsPerPage: HITS_PER_PAGE,
      page,
      filter: [
        "company = RobotMaker",
        `workflowId IN ["${workflowId}"]`,
        "type = TASK",
      ],
      sort: ["timestamp:desc"],
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
      const ts = hit.timestamp ?? hit.updatedTimestamp ?? hit.updated_timestamp;
      if (timestampCutoff != null && ts != null && ts < timestampCutoff) {
        return all.filter((t) => {
          const tts = t.timestamp ?? t.updatedTimestamp ?? t.updated_timestamp;
          return tts != null && tts >= timestampCutoff;
        });
      }
      all.push(hit);
    }

    if (timestampCutoff != null && hits.length > 0) {
      const last = hits[hits.length - 1];
      const lastTs =
        last.timestamp ?? last.updatedTimestamp ?? last.updated_timestamp;
      if (lastTs != null && lastTs < timestampCutoff) {
        return all.filter((t) => {
          const tts = t.timestamp ?? t.updatedTimestamp ?? t.updated_timestamp;
          return tts != null && tts >= timestampCutoff;
        });
      }
    }

    page++;
    if (hits.length < HITS_PER_PAGE) break;
  } while (page <= nbPages);

  if (timestampCutoff != null) {
    return all.filter((t) => {
      const ts = t.timestamp ?? t.updatedTimestamp ?? t.updated_timestamp;
      return ts != null && ts >= timestampCutoff;
    });
  }
  return all;
}

/**
 * Fetch repair and claim workflows in parallel.
 */
export async function fetchBothWorkflows(
  timestampCutoff?: number
): Promise<{ repair: Task[]; claim: Task[] }> {
  const [repair, claim] = await Promise.all([
    fetchAllPages(WORKFLOWS.repair.id, timestampCutoff),
    fetchAllPages(WORKFLOWS.claim.id, timestampCutoff),
  ]);
  return { repair, claim };
}

/**
 * Secondary API: fetch SKU per product.
 * GET https://api.dataslot.app/inventories/RobotMaker/products/{productId}
 * Response: { data: { sku: string, ... } }
 *
 * Rules:
 * - Only call for non-empty productIds (caller passes item.detail.productInfo.id only when present).
 * - Batch in groups of 50 using Promise.all(); 300ms delay between batches.
 * - On non-200 or error: sku = "" and log warning; never throws.
 * - Returns Map<productId, sku> to avoid duplicate API calls for the same product within a sync run.
 */
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
        headers: {
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        console.warn(
          `[API] SKU fetch failed for productId=${productId} status=${res.status}`
        );
        result.set(productId, "");
        return;
      }
      const json = (await res.json()) as { data?: { sku?: string } };
      const sku = json.data?.sku ?? "";
      result.set(productId, sku || "");
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
