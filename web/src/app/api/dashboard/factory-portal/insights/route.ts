import { NextResponse } from "next/server";
import { listFactoryPortalInsights } from "@/lib/queries/factoryPortalDecisions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listFactoryPortalInsights());
  } catch (error) {
    console.error("[dashboard/factory-portal/insights]", error);
    return NextResponse.json({ error: "โหลดสรุปคำตอบโรงงานไม่สำเร็จ" }, { status: 500 });
  }
}
