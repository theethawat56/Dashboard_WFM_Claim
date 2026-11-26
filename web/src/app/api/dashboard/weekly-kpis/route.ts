import { NextResponse } from "next/server";
import { getWeeklyKpis } from "@/lib/queries/weeklyKpis";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await getWeeklyKpis());
  } catch (error) {
    console.error("[dashboard/weekly-kpis]", error);
    return NextResponse.json({ error: "Failed to load weekly KPIs" }, { status: 500 });
  }
}
