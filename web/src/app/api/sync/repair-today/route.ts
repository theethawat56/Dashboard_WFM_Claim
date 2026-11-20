import { NextResponse } from "next/server";
import { runTodayRepairSync } from "@/lib/sync";
import { ensureNewColumns } from "@/lib/migrate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(): Promise<NextResponse> {
  try {
    await ensureNewColumns();
    console.log("[sync/repair-today] Starting today's repair sync...");
    const result = await runTodayRepairSync();
    console.log("[sync/repair-today] Completed:", result);

    return NextResponse.json({
      ok: true,
      message: "อัปเดตงานซ่อมของวันนี้สำเร็จ",
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync/repair-today] Failed:", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
