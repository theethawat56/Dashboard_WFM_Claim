import { NextResponse } from "next/server";
import { getFactoryClaimQueue } from "@/lib/queries/factoryClaimQueue";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await getFactoryClaimQueue());
  } catch (e) {
    console.error("[dashboard/factory-queue]", e);
    return NextResponse.json({ error: "Failed to load factory claim queue" }, { status: 500 });
  }
}
