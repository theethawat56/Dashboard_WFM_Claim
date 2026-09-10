import { NextRequest, NextResponse } from "next/server";
import { getClaimTracking } from "@/lib/queries/claimTracking";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const month = new URL(request.url).searchParams.get("month");
    return NextResponse.json(await getClaimTracking(month));
  } catch (e) {
    console.error("[dashboard/claim-tracking]", e);
    return NextResponse.json({ error: "Failed to load claim tracking" }, { status: 500 });
  }
}
