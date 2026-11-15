import { NextRequest, NextResponse } from "next/server";
import { getModelFactoryStatus } from "@/lib/queries/modelFactoryStatus";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const data = await getModelFactoryStatus(searchParams.get("from"), searchParams.get("to"));
    return NextResponse.json(data);
  } catch (e) {
    console.error("[dashboard/model-factory-status]", e);
    return NextResponse.json({ error: "Failed to load model factory status" }, { status: 500 });
  }
}
