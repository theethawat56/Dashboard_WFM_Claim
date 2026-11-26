import { NextRequest, NextResponse } from "next/server";
import { getFactoryScoreboard } from "@/lib/queries/factoryScoreboard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const data = await getFactoryScoreboard(
      searchParams.get("from"),
      searchParams.get("to"),
      searchParams.get("factory"),
      searchParams.get("kind")
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error("[dashboard/factory-scoreboard]", error);
    return NextResponse.json({ error: "Failed to load factory scoreboard" }, { status: 500 });
  }
}
