import { NextResponse } from "next/server";
import { getClaimedModels } from "@/lib/queries/claimCompensations";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await getClaimedModels();
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[dashboard/claimed-models]", e);
    return NextResponse.json(
      { error: "Failed to load claimed models" },
      { status: 500 }
    );
  }
}
