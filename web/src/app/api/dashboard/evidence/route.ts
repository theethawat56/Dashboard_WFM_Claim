import { NextRequest, NextResponse } from "next/server";
import { getEvidenceBySku } from "@/lib/queries/evidence";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sku = request.nextUrl.searchParams.get("sku");
    if (!sku?.trim()) {
      return NextResponse.json(
        { error: "Missing sku parameter" },
        { status: 400 }
      );
    }
    const rows = await getEvidenceBySku(sku.trim());
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[dashboard/evidence]", e);
    return NextResponse.json(
      { error: "Failed to load evidence" },
      { status: 500 }
    );
  }
}
