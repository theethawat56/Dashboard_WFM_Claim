import { NextRequest, NextResponse } from "next/server";
import { getDailyTopSkus } from "@/lib/queries/trend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") ?? undefined;
    const limit = Math.min(Number(searchParams.get("limit") ?? 5), 20);
    const days = Math.min(Math.max(Number(searchParams.get("days") ?? 7), 1), 90);
    const rows = await getDailyTopSkus(date, limit, days);
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[dashboard/daily-top-skus]", e);
    return NextResponse.json(
      { error: "Failed to load daily top SKUs" },
      { status: 500 }
    );
  }
}
