import { createReadStream } from "fs";
import { stat, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getEvidenceBySku } from "@/lib/queries/evidence";
import {
  listMediaForTasks,
  measureMediaSizes,
  presignGet,
  safeDownloadName,
  type MediaFile,
} from "@/lib/media/taskMedia";
import { loadExportPlan, storeExportPlan } from "@/lib/media/zipPlanCache";
import { planZipParts, ZIP_PART_LIMIT } from "@/lib/media/zipParts";
import { writeStoredZip } from "@/lib/media/zipStore";
import { ensureNewColumns } from "@/lib/migrate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function attachment(filename: string, contentType: string): HeadersInit {
  const ascii = filename.replace(/[^\x20-\x7E]+/g, "_").replace(/"/g, "");
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "no-store",
  };
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeSku(sku: string): string {
  return sku.replace(/[^\w.-]+/g, "_").slice(0, 80) || "sku";
}

async function loadFiles(sku: string, dateFrom?: string, dateTo?: string) {
  await ensureNewColumns();
  const rows = await getEvidenceBySku(sku, { dateFrom, dateTo });
  const files = await listMediaForTasks(rows);
  return { taskCount: new Set(rows.map((row) => row.task_number)).size, files };
}

function workbook(files: MediaFile[], origin: string): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([
    [
      "ลิงก์เปิดผ่านแดชบอร์ด ระบบขอลิงก์ดาวน์โหลดใหม่ทุกครั้งที่กด ใช้ได้ทั้งเลขงาน MNT และ CLM",
    ],
    ["เลขงาน", "ประเภท", "วันที่", "ชนิด", "ชื่อไฟล์", "ลิงก์"],
    ...files.map((file) => [
      file.taskNumber,
      file.taskType,
      file.createDate,
      file.kind,
      file.fileName,
      `${origin}/api/export/media/file?objectKey=${encodeURIComponent(file.objectKey)}`,
    ]),
  ]);
  sheet["!cols"] = [
    { wch: 18 },
    { wch: 10 },
    { wch: 14 },
    { wch: 16 },
    { wch: 42 },
    { wch: 72 },
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "videos");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function safeSegment(value: string): string {
  const cleaned = value.replace(/[\u0000-\u001f\\/:*?"<>|]/g, "_").trim();
  return cleaned.slice(0, 120) || "file";
}

function zipPath(file: MediaFile, used: Set<string>): string {
  const folder = `${safeSegment(file.taskNumber)}/${safeSegment(file.kind)}`;
  const base = safeDownloadName(file.fileName);
  let name = `${folder}/${base}`;
  let n = 2;
  while (used.has(name)) {
    const dot = base.lastIndexOf(".");
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : "";
    name = `${folder}/${stem}-${n}${ext}`;
    n += 1;
  }
  used.add(name);
  return name;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sku = searchParams.get("sku")?.trim() ?? "";
  const format = (searchParams.get("format") ?? "xlsx").toLowerCase();
  const dateFrom = searchParams.get("dateFrom") ?? undefined;
  const dateTo = searchParams.get("dateTo") ?? undefined;

  if (!sku) {
    return NextResponse.json({ error: "ไม่ได้ระบุ SKU" }, { status: 400 });
  }
  if (!["xlsx", "zip", "count", "plan"].includes(format)) {
    return NextResponse.json({ error: "รูปแบบไฟล์ไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const { taskCount, files } = await loadFiles(sku, dateFrom, dateTo);
    if (files.length === 0) {
      return NextResponse.json(
        { error: "ไม่พบวิดีโอหรือรูปในงานของ SKU นี้", taskCount, fileCount: 0 },
        { status: 404 }
      );
    }

    if (format === "count" || format === "plan") {
      const sizes = format === "plan" ? await measureMediaSizes(files) : [];
      const plans =
        format === "plan"
          ? planZipParts(sizes.map((size) => size ?? Number.POSITIVE_INFINITY))
          : [];
      const planId = format === "plan" ? storeExportPlan(files, plans) : undefined;
      return NextResponse.json({
        planId,
        taskCount,
        fileCount: files.length,
        partBytes: ZIP_PART_LIMIT,
        parts: plans.map((part) => {
          const first = files[part.fileIndexes[0]];
          return {
            id: part.id,
            kind: part.kind,
            fileCount: part.fileIndexes.length,
            bytes: part.bytes,
            name:
              part.kind === "file"
                ? safeDownloadName(first?.fileName || first?.objectKey || "file")
                : `part${part.id}`,
            objectKey: part.kind === "file" ? first?.objectKey ?? "" : undefined,
          };
        }),
      });
    }

    const fileSlug = safeSku(sku);
    if (format === "xlsx") {
      const body = workbook(files, request.nextUrl.origin);
      return new NextResponse(new Uint8Array(body), {
        headers: attachment(
          `videos_${fileSlug}_${stamp()}.xlsx`,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
      });
    }

    const stored = loadExportPlan(searchParams.get("planId") ?? "");
    if (searchParams.get("planId") && !stored) {
      return NextResponse.json(
        { error: "แผนดาวน์โหลดหมดอายุ กดเตรียม ZIP ใหม่" },
        { status: 409 }
      );
    }
    const plannedFiles = stored?.files ?? files;
    const sizes = stored ? [] : await measureMediaSizes(plannedFiles);
    const plans =
      stored?.parts ?? planZipParts(sizes.map((size) => size ?? Number.POSITIVE_INFINITY));
    const zipPlans = plans.filter((part) => part.kind === "zip");
    const partId = Number(searchParams.get("part") || (zipPlans.length === 1 ? String(zipPlans[0]?.id ?? "") : ""));
    const selected = plans.find((part) => part.id === partId && part.kind === "zip");
    if (!selected) {
      return NextResponse.json({ error: "ไม่พบส่วน ZIP ที่ต้องการ" }, { status: 400 });
    }
    const selectedFiles = selected.fileIndexes.map((index) => plannedFiles[index]).filter(Boolean);
    const used = new Set<string>();
    const zipPathOnDisk = join(tmpdir(), `wfm-videos-${randomUUID()}.zip`);
    const downloadName =
      plans.length > 1
        ? `videos_${fileSlug}_${stamp()}_part${selected.id}.zip`
        : `videos_${fileSlug}_${stamp()}.zip`;
    try {
      await writeStoredZip(
        selectedFiles.map((file) => {
          const name = zipPath(file, used);
          return {
            name,
            open: async () => {
              const signed = await presignGet(file.objectKey, 3600);
              const res = await fetch(signed, {
                cache: "no-store",
                signal: AbortSignal.timeout(180_000),
              });
              if (!res.ok || !res.body) return null;
              return res.body;
            },
          };
        }),
        zipPathOnDisk
      );
      const zipStat = await stat(zipPathOnDisk);
      const nodeStream = createReadStream(zipPathOnDisk);
      const cleanup = () => {
        unlink(zipPathOnDisk).catch(() => undefined);
      };
      nodeStream.on("close", cleanup);
      nodeStream.on("error", cleanup);
      return new NextResponse(Readable.toWeb(nodeStream) as ReadableStream, {
        headers: {
          ...attachment(downloadName, "application/zip"),
          "Content-Length": String(zipStat.size),
        },
      });
    } catch (error) {
      await unlink(zipPathOnDisk).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    console.error("[export/media]", error);
    const message = error instanceof Error ? error.message : "Export ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
