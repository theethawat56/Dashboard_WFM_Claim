import { NextRequest, NextResponse } from "next/server";
import { getTasks } from "@/lib/queries/tasks";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;
    const type = (searchParams.get("type") as "repair" | "claim" | "all") ?? "all";
    const sku = searchParams.get("sku") ?? undefined;
    const reclaimParam = searchParams.get("reclaim");
    const reclaim =
      reclaimParam === "true" ? true : reclaimParam === "false" ? false : undefined;
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const page = Number(searchParams.get("page")) || 1;
    const limit = Number(searchParams.get("limit")) || 50;

    const result = await getTasks({
      search,
      type,
      sku,
      reclaim,
      from,
      to,
      page,
      limit,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[dashboard/tasks]", e);
    return NextResponse.json(
      { error: "Failed to load tasks" },
      { status: 500 }
    );
  }
}
