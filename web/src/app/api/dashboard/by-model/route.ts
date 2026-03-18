import { NextRequest, NextResponse } from "next/server";
import { getByModel } from "@/lib/queries/byModel";

export const dynamic = "force-dynamic";

type TypeFilter = "repair" | "claim" | "all";
type MonthsFilter = "3" | "6" | "12" | "18" | "all";
type RiskFilter = "high" | "medium" | "low" | "all";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sku = searchParams.get("sku") ?? undefined;
    const type = (searchParams.get("type") as TypeFilter) ?? "all";
    const monthsParam = searchParams.get("months");
    const months: 3 | 6 | 12 | 18 | "all" =
      monthsParam === "all" || !monthsParam
        ? "all"
        : (Number(monthsParam) as 3 | 6 | 12 | 18);
    const risk = (searchParams.get("risk") as RiskFilter) ?? "all";

    const rows = await getByModel({
      sku,
      type: type === "all" ? "all" : type,
      months,
      risk,
    });
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[dashboard/by-model]", e);
    return NextResponse.json(
      { error: "Failed to load by-model data" },
      { status: 500 }
    );
  }
}
