import { NextRequest, NextResponse } from "next/server";
import { toggleFactorySubmission } from "@/lib/queries/factorySubmissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { task_id?: string; task_number?: string };
    const taskId = body.task_id?.trim() ?? "";
    const taskNumber = body.task_number?.trim() ?? "";
    if (!taskId || !taskNumber) {
      return NextResponse.json({ error: "task_id and task_number are required" }, { status: 400 });
    }
    const sent = await toggleFactorySubmission({ taskId, taskNumber });
    return NextResponse.json({ task_id: taskId, sent });
  } catch (e) {
    console.error("[dashboard/factory-submissions]", e);
    return NextResponse.json({ error: "Failed to update factory submission" }, { status: 500 });
  }
}
