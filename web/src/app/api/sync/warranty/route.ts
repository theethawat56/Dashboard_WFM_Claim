import { NextRequest, NextResponse } from "next/server";
import { fetchWarrantyForPendingTasks } from "@/lib/sync/warranty";
import { ensureNewColumns } from "@/lib/migrate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Backfill warranty data (warranty_start_date, days_to_repair, ...) for tasks
 * that already have customer_guid + warranty_id but no warranty_start_ts yet.
 *
 * Query params:
 *   - all=1     : refresh warranty for ALL tasks with guid+warrantyId, not just missing ones
 *   - limit=N   : process at most N tasks (helpful for testing)
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const all = searchParams.get("all") === "1";
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;

    await ensureNewColumns();
    console.log(
      `[sync/warranty] Backfilling warranty data (onlyMissing=${!all}, limit=${
        limit ?? "all"
      })`
    );
    const stats = await fetchWarrantyForPendingTasks({
      onlyMissing: !all,
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    return NextResponse.json({
      ok: true,
      message: "Warranty backfill done",
      ...stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync/warranty] Failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
