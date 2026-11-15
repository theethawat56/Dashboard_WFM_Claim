import { NextRequest, NextResponse } from "next/server";
import { listFactoryCases } from "@/lib/cases";
import { factoryByToken } from "@/lib/factories";
import { filesForTask, presignGet } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const factory = await factoryByToken(token);
  if (!factory) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const taskId = request.nextUrl.searchParams.get("taskId")?.trim() ?? "";
  const index = Number(request.nextUrl.searchParams.get("index"));
  if (!taskId || !Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cases = await listFactoryCases(factory.id);
  const row = cases.find((item) => item.id === taskId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const files = await filesForTask(row.taskNumber);
    const file = files[index];
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const url = await presignGet(file.objectKey);
    return NextResponse.json({ url });
  } catch (error) {
    console.error("[factory media]", error);
    return NextResponse.json({ error: "This file could not be opened." }, { status: 502 });
  }
}
