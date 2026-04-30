import { NextResponse } from "next/server";
import { getCompOverall } from "@/lib/queries/claimCompensations";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getCompOverall();
    return NextResponse.json(data);
  } catch (e) {
    console.error("[claim-compensations/summary]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
