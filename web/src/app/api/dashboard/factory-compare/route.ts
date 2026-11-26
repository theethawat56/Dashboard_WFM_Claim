import { NextRequest, NextResponse } from "next/server";
import { getFactoryCompare } from "@/lib/queries/factoryCompare";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    return NextResponse.json(await getFactoryCompare(searchParams.get("from"), searchParams.get("to")));
  } catch (error) {
    console.error("[dashboard/factory-compare]", error);
    return NextResponse.json({ error: "Failed to load factory comparison" }, { status: 500 });
  }
}
