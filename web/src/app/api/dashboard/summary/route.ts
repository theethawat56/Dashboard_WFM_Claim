import { NextResponse } from "next/server";
import { getSummary, getLatestSyncFinishedAt } from "@/lib/queries/summary";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [stats, latestSync] = await Promise.all([
      getSummary(),
      getLatestSyncFinishedAt(),
    ]);
    return NextResponse.json({
      ...stats,
      latest_sync_at: latestSync,
    });
  } catch (e) {
    console.error("[dashboard/summary]", e);
    return NextResponse.json(
      { error: "Failed to load summary" },
      { status: 500 }
    );
  }
}
