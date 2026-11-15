import { NextRequest, NextResponse } from "next/server";
import { assertMediaKey, presignGet, safeDownloadName } from "@/lib/media/taskMedia";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function contentType(fileName: string, upstream: string | null): string {
  const raw = upstream?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (raw && raw !== "application/octet-stream" && raw !== "binary/octet-stream") return raw;
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "mp4" || ext === "m4v") return "video/mp4";
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "heic") return "image/heic";
  return raw || "application/octet-stream";
}

function disposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: NextRequest) {
  const objectKey = request.nextUrl.searchParams.get("objectKey")?.trim() ?? "";
  try {
    assertMediaKey(objectKey);
    const fileName = safeDownloadName(objectKey);
    const signed = await presignGet(objectKey, 3600);
    const upstream = await fetch(signed, {
      cache: "no-store",
      signal: AbortSignal.timeout(180_000),
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "เปิดไฟล์ไม่สำเร็จ" }, { status: 502 });
    }
    const headers = new Headers();
    headers.set("Content-Type", contentType(fileName, upstream.headers.get("content-type")));
    headers.set("Content-Disposition", disposition(fileName));
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);
    return new NextResponse(upstream.body, { headers });
  } catch (error) {
    console.error("[export/media/file]", error);
    return NextResponse.json({ error: "เปิดไฟล์ไม่สำเร็จ" }, { status: 400 });
  }
}
