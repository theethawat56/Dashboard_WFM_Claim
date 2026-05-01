import { NextResponse } from "next/server";
import { ensureNewColumns } from "@/lib/migrate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Run pending schema migrations against the live Turso database.
 *
 * Auth: if `CRON_SECRET` is set in the environment, the caller must send
 * `Authorization: Bearer <CRON_SECRET>` (matches `/api/cron/sync`). Without
 * `CRON_SECRET` configured the endpoint is unauthenticated — the migration is
 * idempotent (PRAGMA-checked ALTER TABLE) so this is acceptable for one-shot
 * fixes from the deploying user, but you should set `CRON_SECRET` in
 * production to prevent strangers from probing your DB.
 *
 * Both GET and POST are accepted so you can hit it from a browser.
 */
async function handle(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";
    const report = await ensureNewColumns({ force });
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/migrate] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
