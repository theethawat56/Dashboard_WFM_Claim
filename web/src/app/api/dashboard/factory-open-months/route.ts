import { NextResponse } from "next/server";
import { getFactoryOpenMonths } from "@/lib/queries/factoryOpenMonths";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await getFactoryOpenMonths());
  } catch (error) {
    console.error("[dashboard/factory-open-months]", error);
    return NextResponse.json({ error: "Failed to load factory open months" }, { status: 500 });
  }
}
