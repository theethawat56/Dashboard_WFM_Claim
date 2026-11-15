import { NextRequest, NextResponse } from "next/server";
import {
  confirmFactoryDecision,
  listFactoryPortalHome,
  returnFactoryDecision,
} from "@/lib/queries/factoryPortalDecisions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listFactoryPortalHome());
  } catch (error) {
    console.error("[dashboard/factory-portal]", error);
    return NextResponse.json({ error: "โหลดคำตอบจากโรงงานไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { taskId?: string; action?: string };
    const taskId = String(body.taskId ?? "").trim();
    if (!taskId) return NextResponse.json({ error: "ไม่พบเลขงาน" }, { status: 400 });
    const result =
      body.action === "confirm"
        ? await confirmFactoryDecision(taskId)
        : body.action === "return"
          ? await returnFactoryDecision(taskId)
          : { ok: false as const, error: "คำสั่งไม่ถูกต้อง" };
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[dashboard/factory-portal] POST", error);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
