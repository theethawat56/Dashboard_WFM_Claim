import { NextRequest, NextResponse } from "next/server";
import { getUnclaimedClaimsSummary } from "@/lib/queries/unclaimedClaims";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const monthsParam = searchParams.get("months");
    const months = monthsParam ? Math.max(1, Number(monthsParam)) : 6;

    const excludeParam = searchParams.get("exclude"); // comma-separated task_numbers
    const excludeTaskNumbers = excludeParam
      ? excludeParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const summary = await getUnclaimedClaimsSummary({
      months,
      excludeTaskNumbers,
    });

    return NextResponse.json(summary);
  } catch (e) {
    console.error("[unclaimed-claims]", e);
    return NextResponse.json(
      { error: "Failed to load unclaimed claims summary" },
      { status: 500 }
    );
  }
}

