import { NextResponse } from "next/server";
import { runTodayRepairSync } from "@/lib/sync";
import { ensureNewColumns } from "@/lib/migrate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureNewColumns();
    console.log("[cron/sync-repair-today] Starting hourly repair sync...");
    const result = await runTodayRepairSync();
    console.log("[cron/sync-repair-today] Completed:", result);

    return NextResponse.json({
      ok: true,
      message: "Hourly repair sync completed",
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/sync-repair-today] Failed:", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
