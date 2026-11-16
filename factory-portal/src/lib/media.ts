const SEARCH_URL = "https://open-api.dataslot.app/search/wfm/v1/RobotMaker";
const PRESIGN_URL = "https://api.dataslot.app/wfmUtils/s3/presignedUrl";
const BUCKET = "dataslot-resource-private";
const KEY_PREFIX = "RobotMaker/wfm-media/";
const CHUNK = 40;

export type CaseFile = {
  kind: "video" | "image";
  label: string;
  objectKey: string;
};

type SearchHit = {
  taskNumber?: string;
  status?: string;
  detail?: Record<string, unknown>;
};

function quoteTaskNumber(taskNumber: string): string {
  return `"${taskNumber.replace(/["\\]/g, "")}"`;
}

function toObjectKey(raw: string): string | null {
  const clean = raw.trim().split("?")[0]?.trim() ?? "";
  if (!clean || clean.startsWith("http://") || clean.startsWith("https://")) return null;
  const rel = clean.replace(/^\/+/, "");
  if (rel.includes("..") || rel.includes("\\")) return null;
  if (rel.startsWith(KEY_PREFIX)) return rel;
  if (rel.startsWith("RobotMaker/")) return null;
  return KEY_PREFIX + rel;
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

function addFile(files: CaseFile[], seen: Set<string>, raw: string, kind: "video" | "image", label: string): void {
  const objectKey = toObjectKey(raw);
  if (!objectKey || seen.has(objectKey)) return;
  seen.add(objectKey);
  files.push({ kind, label, objectKey });
}

function testVideoPaths(hit: SearchHit | undefined): string[] {
  const paths: string[] = [];
  collectStrings(hit?.detail?.testVideos, paths);
  return paths;
}

function mntRefs(hit: SearchHit | undefined): string[] {
  const detail = hit?.detail;
  if (!detail) return [];
  const info = (detail.taskInfo ?? detail.task_info) as { refNumbers?: unknown; ref_numbers?: unknown } | undefined;
  const raw = info?.refNumbers ?? info?.ref_numbers;
  if (!Array.isArray(raw)) return [];
  const refs: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const ref = value.trim();
    if (ref.toUpperCase().startsWith("MNT-")) refs.push(ref);
  }
  return refs;
}

function cancelledRepairTestVideos(hit: SearchHit | undefined, hits: Map<string, SearchHit>): string[] {
  const paths: string[] = [];
  for (const ref of mntRefs(hit)) {
    const linked = hits.get(ref);
    if (!linked || String(linked.status ?? "").toUpperCase() !== "VOIDED") continue;
    paths.push(...testVideoPaths(linked));
  }
  return paths;
}

function filesFromHit(hit: SearchHit | undefined, extraTestPaths: string[] = []): CaseFile[] {
  const detail = hit?.detail;
  if (!detail && extraTestPaths.length === 0) return [];
  const files: CaseFile[] = [];
  const seen = new Set<string>();
  const counts = { "test-video": 0, "technician-video": 0, photo: 0 };

  const testVideos = [...testVideoPaths(hit), ...extraTestPaths];
  for (const raw of testVideos) {
    if (fileKind(raw) === "image") continue;
    counts["test-video"] += 1;
    const n = counts["test-video"];
    addFile(files, seen, raw, "video", n > 1 ? `Test video ${n}` : "Test video");
  }

  const techPaths: string[] = [];
  if (detail) {
    for (const source of [detail.serviceImages, detail.recorder, detail.images]) collectStrings(source, techPaths);
  }
  for (const raw of techPaths) {
    const kind = fileKind(raw);
    if (kind === "image") {
      counts.photo += 1;
      const n = counts.photo;
      addFile(files, seen, raw, "image", n > 1 ? `Photo ${n}` : "Photo");
    } else if (kind !== "other") {
      counts["technician-video"] += 1;
      const n = counts["technician-video"];
      addFile(files, seen, raw, "video", n > 1 ? `Technician video ${n}` : "Technician video");
    }
  }
  return files;
}

async function fetchTasksByNumber(taskNumbers: string[]): Promise<Map<string, SearchHit>> {
  const found = new Map<string, SearchHit>();
  const unique = [...new Set(taskNumbers.map((n) => n.trim()).filter(Boolean))];

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const filterValue = chunk.map(quoteTaskNumber).join(", ");
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        hitsPerPage: Math.max(chunk.length, 20),
        page: 1,
        filter: ["company = RobotMaker", "type = TASK", `taskNumber IN [${filterValue}]`],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Task search failed (${res.status})`);
    const data = (await res.json()) as { hits?: SearchHit[] };
    for (const hit of data.hits ?? []) {
      if (hit.taskNumber) found.set(hit.taskNumber, hit);
    }
  }
  return found;
}

export async function filesForTasks(taskNumbers: string[]): Promise<Map<string, CaseFile[]>> {
  const hits = await fetchTasksByNumber(taskNumbers);
  const missingRefs = new Set<string>();
  for (const taskNumber of new Set(taskNumbers)) {
    for (const ref of mntRefs(hits.get(taskNumber))) {
      if (!hits.has(ref)) missingRefs.add(ref);
    }
  }
  if (missingRefs.size > 0) {
    try {
      const linked = await fetchTasksByNumber([...missingRefs]);
      for (const [taskNumber, hit] of linked) hits.set(taskNumber, hit);
    } catch (error) {
      console.error("[factory media refs]", error);
    }
  }

  const files = new Map<string, CaseFile[]>();
  for (const taskNumber of new Set(taskNumbers)) {
    const hit = hits.get(taskNumber);
    files.set(taskNumber, filesFromHit(hit, cancelledRepairTestVideos(hit, hits)));
  }
  return files;
}

export async function filesForTask(taskNumber: string): Promise<CaseFile[]> {
  const files = await filesForTasks([taskNumber]);
  return files.get(taskNumber) ?? [];
}

export async function presignGet(objectKey: string): Promise<string> {
  if (!objectKey.startsWith(KEY_PREFIX) || objectKey.includes("..") || objectKey.includes("\\")) {
    throw new Error("invalid object key");
  }
  const url = new URL(PRESIGN_URL);
  url.searchParams.set("bucketName", BUCKET);
  url.searchParams.set("objectKey", objectKey);
  url.searchParams.set("action", "GET");
  url.searchParams.set("expiration", "3600");
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Presign failed (${res.status})`);
  const body = (await res.json()) as { data?: { presignedUrl?: string } };
  const signed = body.data?.presignedUrl;
  if (!signed) throw new Error("Presign failed");
  return signed;
}
