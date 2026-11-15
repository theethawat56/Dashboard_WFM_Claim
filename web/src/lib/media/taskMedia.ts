import type { EvidenceRow } from "@/types/dashboard";

const SEARCH_URL = "https://open-api.dataslot.app/search/wfm/v1/RobotMaker";
const PRESIGN_URL = "https://api.dataslot.app/wfmUtils/s3/presignedUrl";
const BUCKET = "dataslot-resource-private";
const KEY_PREFIX = "RobotMaker/wfm-media/";
const CHUNK = 40;

export const MEDIA_KIND = {
  testVideo: "test-video",
  techVideo: "technician-video",
  image: "image",
} as const;

export interface MediaFile {
  taskNumber: string;
  taskType: string;
  createDate: string;
  kind: string;
  fileName: string;
  objectKey: string;
}

interface SearchHit {
  taskNumber?: string;
  detail?: Record<string, unknown>;
}

function quoteTaskNumber(taskNumber: string): string {
  return `"${taskNumber.replace(/["\\]/g, "")}"`;
}

export function toObjectKey(raw: string): string | null {
  const clean = raw.trim().split("?")[0]?.trim() ?? "";
  if (!clean || clean.startsWith("http://") || clean.startsWith("https://")) return null;
  const rel = clean.replace(/^\/+/, "");
  if (rel.includes("..") || rel.includes("\\")) return null;
  if (rel.startsWith(KEY_PREFIX)) return rel;
  if (rel.startsWith("RobotMaker/")) return null;
  return KEY_PREFIX + rel;
}

export function safeDownloadName(objectKey: string): string {
  const base = objectKey.split("/").filter(Boolean).pop() || "file";
  const cleaned = base
    .replace(/[\u0000-\u001f\\/:*?"<>|]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.slice(0, 180) || "file";
}

export function assertMediaKey(objectKey: string): string {
  if (!objectKey.startsWith(KEY_PREFIX) || objectKey.includes("..") || objectKey.includes("\\")) {
    throw new Error("invalid object key");
  }
  return objectKey;
}

function fileKind(path: string): "video" | "image" | "other" {
  const value = path.toLowerCase().split("?")[0] ?? "";
  if (value.includes("/video/") || /\.(mp4|mov|m4v|webm|avi|mkv)$/.test(value)) return "video";
  if (value.includes("/image/") || /\.(jpe?g|png|webp|heic|gif)$/.test(value)) return "image";
  return "other";
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["s3Url", "url", "path", "key", "file"]) {
      if (typeof record[key] === "string") out.push(record[key] as string);
    }
    if (Array.isArray(record.list)) collectStrings(record.list, out);
  }
}

function baseName(path: string): string {
  const clean = path.split("?")[0] ?? path;
  const name = clean.split("/").filter(Boolean).pop() ?? "file";
  return name.replace(/[\\/]/g, "_");
}

function formatTaskDate(row: EvidenceRow): string {
  if (row.create_date && row.create_date.trim()) return row.create_date.trim();
  if (row.timestamp == null) return "";
  const date = new Date(row.timestamp);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addFile(
  files: MediaFile[],
  seen: Set<string>,
  row: EvidenceRow,
  raw: string,
  kind: string
): void {
  const objectKey = toObjectKey(raw);
  if (!objectKey || seen.has(objectKey)) return;
  seen.add(objectKey);
  files.push({
    taskNumber: row.task_number,
    taskType: row.task_type === "claim" ? "เคลม" : "ซ่อม",
    createDate: formatTaskDate(row),
    kind,
    fileName: baseName(raw),
    objectKey,
  });
}

export function mntRefsFromTask(hit: SearchHit | undefined): string[] {
  const detail = hit?.detail;
  if (!detail) return [];
  const info = (detail.taskInfo ?? detail.task_info) as { refNumbers?: unknown; ref_numbers?: unknown } | undefined;
  const raw = info?.refNumbers ?? info?.ref_numbers;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === "string" && value.startsWith("MNT-"));
}

export function mediaFromTask(
  row: EvidenceRow,
  hit: SearchHit | undefined,
  scope: "all" | "videos" | "images" = "all"
): MediaFile[] {
  const detail = hit?.detail;
  if (!detail) return [];
  const files: MediaFile[] = [];
  const seen = new Set<string>();

  if (scope !== "images") {
    const testVideos: string[] = [];
    collectStrings(detail.testVideos, testVideos);
    for (const raw of testVideos) {
      if (fileKind(raw) === "image") continue;
      addFile(files, seen, row, raw, MEDIA_KIND.testVideo);
    }
  }

  const techSources: unknown[] = [detail.serviceImages, detail.recorder, detail.images];
  const techPaths: string[] = [];
  for (const source of techSources) collectStrings(source, techPaths);
  for (const raw of techPaths) {
    const kind = fileKind(raw);
    if (kind === "image") {
      if (scope !== "videos") addFile(files, seen, row, raw, MEDIA_KIND.image);
    } else if (scope !== "images") {
      addFile(files, seen, row, raw, MEDIA_KIND.techVideo);
    }
  }

  const order = [MEDIA_KIND.testVideo, MEDIA_KIND.techVideo, MEDIA_KIND.image];
  files.sort((a, b) => order.indexOf(a.kind as (typeof order)[number]) - order.indexOf(b.kind as (typeof order)[number]));
  return files;
}

export async function fetchTasksByNumber(
  taskNumbers: string[]
): Promise<Map<string, SearchHit>> {
  const found = new Map<string, SearchHit>();
  const unique = [...new Set(taskNumbers.map((n) => n.trim()).filter(Boolean))];

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const filterValue = chunk.map(quoteTaskNumber).join(", ");
    let page = 1;
    let nbPages = 1;
    do {
      const res = await fetch(SEARCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          hitsPerPage: Math.max(chunk.length, 20),
          page,
          filter: [
            "company = RobotMaker",
            "type = TASK",
            `taskNumber IN [${filterValue}]`,
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`ค้นงานไม่สำเร็จ (${res.status})`);
      }
      const data = (await res.json()) as {
        hits?: SearchHit[];
        nbHits?: number;
        nbPages?: number;
      };
      const hits = data.hits ?? [];
      for (const hit of hits) {
        if (hit.taskNumber) found.set(hit.taskNumber, hit);
      }
      const nbHits = typeof data.nbHits === "number" ? data.nbHits : hits.length;
      nbPages =
        typeof data.nbPages === "number" && data.nbPages >= 1
          ? data.nbPages
          : Math.max(1, Math.ceil(nbHits / Math.max(chunk.length, 20)));
      page += 1;
    } while (page <= nbPages && page <= 20);
  }

  return found;
}

export async function listMediaForTasks(rows: EvidenceRow[]): Promise<MediaFile[]> {
  const byNumber = new Map<string, EvidenceRow>();
  for (const row of rows) {
    if (row.task_number && !byNumber.has(row.task_number)) byNumber.set(row.task_number, row);
  }
  const hits = await fetchTasksByNumber([...byNumber.keys()]);
  const missingMnt = new Set<string>();
  for (const row of byNumber.values()) {
    if (!row.task_number.startsWith("CLM-")) continue;
    for (const ref of mntRefsFromTask(hits.get(row.task_number))) {
      if (!hits.has(ref)) missingMnt.add(ref);
    }
  }
  if (missingMnt.size > 0) {
    const linked = await fetchTasksByNumber([...missingMnt]);
    for (const [taskNumber, hit] of linked) hits.set(taskNumber, hit);
  }

  const files: MediaFile[] = [];
  for (const row of byNumber.values()) {
    const hit = hits.get(row.task_number);
    const mntRefs = row.task_number.startsWith("CLM-") ? mntRefsFromTask(hit) : [];
    if (mntRefs.length === 0) {
      files.push(...mediaFromTask(row, hit));
      continue;
    }
    const scoped = [
      ...mediaFromTask(row, hit, "images"),
      ...mntRefs.flatMap((ref) => mediaFromTask(row, hits.get(ref), "videos")),
    ];
    const seen = new Set<string>();
    for (const file of scoped) {
      if (seen.has(file.objectKey)) continue;
      seen.add(file.objectKey);
      files.push(file);
    }
  }
  return files;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function mediaFileSize(objectKey: string): Promise<number | null> {
  const signed = await presignGet(objectKey, 120);
  const res = await fetch(signed, {
    cache: "no-store",
    headers: { Range: "bytes=0-0" },
    signal: AbortSignal.timeout(30_000),
  });
  await res.body?.cancel().catch(() => undefined);
  const range = res.headers.get("content-range");
  const total = range?.split("/")[1];
  if (total && total !== "*") {
    const size = Number(total);
    if (Number.isFinite(size) && size >= 0) return size;
  }
  if (res.status === 200) {
    const length = Number(res.headers.get("content-length"));
    if (Number.isFinite(length) && length >= 0) return length;
  }
  return null;
}

export async function measureMediaSizes(files: MediaFile[]): Promise<Array<number | null>> {
  return mapPool(files, 6, async (file) => {
    try {
      return await mediaFileSize(file.objectKey);
    } catch {
      return null;
    }
  });
}

export async function presignGet(objectKey: string, expiration = 3600): Promise<string> {
  const key = assertMediaKey(objectKey);
  const url = new URL(PRESIGN_URL);
  url.searchParams.set("bucketName", BUCKET);
  url.searchParams.set("objectKey", key);
  url.searchParams.set("action", "GET");
  url.searchParams.set("expiration", String(expiration));
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ขอลิงก์ไฟล์ไม่สำเร็จ (${res.status})`);
  const body = (await res.json()) as { data?: { presignedUrl?: string } };
  const signed = body.data?.presignedUrl;
  if (!signed) throw new Error("ขอลิงก์ไฟล์ไม่สำเร็จ");
  return signed;
}
