import { NextResponse } from "next/server";
import { getDistinctSkus } from "@/lib/queries/tasks";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const skus = await getDistinctSkus();
    return NextResponse.json(skus);
  } catch (e) {
    console.error("[dashboard/skus]", e);
    return NextResponse.json(
      { error: "Failed to load SKU list" },
      { status: 500 }
    );
  }
}
