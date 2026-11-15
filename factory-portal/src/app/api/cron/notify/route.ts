import { NextRequest, NextResponse } from "next/server";
import { runDailyNotifications } from "@/lib/notify";

export const dynamic = "force-dynamic";

async function cronSecret(): Promise<string> {
  const fromProcess = process.env.CRON_SECRET?.trim();
  if (fromProcess) return fromProcess;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const secret = (env as { CRON_SECRET?: string }).CRON_SECRET;
    return String(secret ?? "").trim();
  } catch {
    return "";
  }
}

export async function GET(request: NextRequest) {
  const secret = await cronSecret();
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDailyNotifications();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[factory-portal cron]", error);
    return NextResponse.json({ error: "Notification run failed" }, { status: 500 });
  }
}
