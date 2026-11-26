import { NextRequest, NextResponse } from "next/server";
import { listSkuFactoryRows, setSkuFactory } from "@/lib/queries/skuFactoryMap";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await listSkuFactoryRows());
  } catch (error) {
    console.error("[dashboard/sku-factories]", error);
    return NextResponse.json({ error: "Failed to load SKU factory map" }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      sku?: string;
      factoryId?: string;
      supplierName?: string;
      exclude?: boolean;
      reason?: string;
    };
    const result = await setSkuFactory({
      sku: String(body.sku ?? ""),
      factoryId: body.factoryId,
      supplierName: body.supplierName,
      exclude: body.exclude === true,
      reason: body.reason,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(await listSkuFactoryRows());
  } catch (error) {
    console.error("[dashboard/sku-factories]", error);
    return NextResponse.json({ error: "Failed to save SKU factory map" }, { status: 500 });
  }
}
