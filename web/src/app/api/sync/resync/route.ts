import { NextResponse } from "next/server";
import { runRecentSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(): Promise<NextResponse> {
  try {
    console.log("[sync/resync] Starting 30-day resync...");
    const result = await runRecentSync(30);
    console.log("[sync/resync] Resync completed:", result);

    return NextResponse.json({
      ok: true,
      message: "Re-sync (30 วันย้อนหลัง) สำเร็จ",
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync/resync] Resync failed:", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
