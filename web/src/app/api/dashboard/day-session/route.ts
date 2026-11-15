import { NextRequest, NextResponse } from "next/server";
import { getRecentDayLogs, saveDayWorkLog } from "@/lib/queries/daySession";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const logs = await getRecentDayLogs(7);
    return NextResponse.json({ logs });
  } catch (e) {
    console.error("[day-session]", e);
    return NextResponse.json({ error: "โหลดบันทึกวันไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      work_date?: string;
      claimed_task_numbers?: string[];
      status?: "active" | "ended";
    };
    if (!body.work_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.work_date)) {
      return NextResponse.json({ error: "วันที่ไม่ถูกต้อง" }, { status: 400 });
    }
    const saved = await saveDayWorkLog({
      workDate: body.work_date,
      claimedTaskNumbers: body.claimed_task_numbers ?? [],
      status: body.status === "ended" ? "ended" : "active",
    });
    return NextResponse.json(saved);
  } catch (e) {
    console.error("[day-session]", e);
    return NextResponse.json({ error: "บันทึกวันไม่สำเร็จ" }, { status: 500 });
  }
}
