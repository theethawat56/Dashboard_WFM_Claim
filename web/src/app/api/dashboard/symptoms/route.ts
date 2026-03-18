import { NextRequest, NextResponse } from "next/server";
import { getSymptoms } from "@/lib/queries/symptoms";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const limit = Math.min(50, Math.max(5, Number(request.nextUrl.searchParams.get("limit")) || 20));
    const rows = await getSymptoms(limit);
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[dashboard/symptoms]", e);
    return NextResponse.json(
      { error: "Failed to load symptoms data" },
      { status: 500 }
    );
  }
}
