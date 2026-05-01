import { NextResponse } from "next/server";
import { runDailySync } from "@/lib/sync";
import { ensureNewColumns } from "@/lib/migrate";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes (Vercel Pro), adjust if needed

export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureNewColumns();
    console.log("[cron/sync] Starting daily sync...");
    const result = await runDailySync();
    console.log("[cron/sync] Daily sync completed:", result);

    return NextResponse.json({
      ok: true,
      message: "Daily sync completed",
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/sync] Daily sync failed:", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
