import { NextRequest, NextResponse } from "next/server";
import { parseSkusParam } from "@/lib/factoryClaimSkus";
import {
  getFactoryKpis,
  getFactoryMatches,
  getFactoryPoHeaders,
  getFactoryPoSkuSummary,
} from "@/lib/queries/factoryClaims";
import type { PoMatchTier } from "@/types/dashboard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "kpis";
    const skus = parseSkusParam(searchParams.get("skus"));

    if (view === "kpis") {
      return NextResponse.json(await getFactoryKpis(skus));
    }
    if (view === "pos") {
      return NextResponse.json(await getFactoryPoHeaders(skus));
    }
    if (view === "sku-summary") {
      return NextResponse.json(await getFactoryPoSkuSummary(skus));
    }
    if (view === "matches") {
      const typeParam = searchParams.get("type");
      const type =
        typeParam === "repair" || typeParam === "claim" ? typeParam : "all";
      const tierParam = searchParams.get("tier");
      const tier: PoMatchTier | "all" =
        tierParam === "green" ||
        tierParam === "orange" ||
        tierParam === "yellow" ||
        tierParam === "gray"
          ? tierParam
          : "all";
      const result = await getFactoryMatches({
        search: searchParams.get("search") ?? undefined,
        type,
        tier,
        sku: searchParams.get("sku") ?? undefined,
        skus,
        page: Number(searchParams.get("page")) || 1,
        limit: Number(searchParams.get("limit")) || 50,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown view" }, { status: 400 });
  } catch (e) {
    console.error("[dashboard/factory-claims]", e);
    return NextResponse.json(
      { error: "Failed to load factory claims" },
      { status: 500 }
    );
  }
}
