import { NextRequest, NextResponse } from "next/server";
import { getFactoryClaimQueue } from "@/lib/queries/factoryClaimQueue";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    return NextResponse.json(await getFactoryClaimQueue({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      kind: searchParams.get("kind"),
      factory: searchParams.get("factory"),
    }));
  } catch (e) {
    console.error("[dashboard/factory-queue]", e);
    return NextResponse.json({ error: "Failed to load factory claim queue" }, { status: 500 });
  }
}
