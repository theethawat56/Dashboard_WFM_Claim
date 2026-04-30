import { NextRequest, NextResponse } from "next/server";
import { getDailyTrend } from "@/lib/queries/trend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(Number(searchParams.get("days") ?? 30), 90);
    const rows = await getDailyTrend(days);
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[dashboard/daily-trend]", e);
    return NextResponse.json(
      { error: "Failed to load daily trend data" },
      { status: 500 }
    );
  }
}
