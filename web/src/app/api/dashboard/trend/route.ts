import { NextResponse } from "next/server";
import { getMonthlyTrend } from "@/lib/queries/trend";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await getMonthlyTrend();
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[dashboard/trend]", e);
    return NextResponse.json(
      { error: "Failed to load trend data" },
      { status: 500 }
    );
  }
}
