import { NextRequest, NextResponse } from "next/server";
import {
  insertBatch,
  getBatchesBySku,
  getCompensatedTaskNumbers,
  getCompSkuSummary,
  getTasksForSku,
} from "@/lib/queries/claimCompensations";
import type { CompType } from "@/types/dashboard";

export const dynamic = "force-dynamic";

const VALID_TYPES: CompType[] = ["cost_refund", "spare_parts", "deduce", "replacement"];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");
    const sku = searchParams.get("sku");

    if (view === "sku-summary") {
      return NextResponse.json(await getCompSkuSummary());
    }

    if (view === "batches" && sku) {
      return NextResponse.json(await getBatchesBySku(sku));
    }

    if (view === "tasks" && sku) {
      return NextResponse.json(await getTasksForSku(sku));
    }

    // Default: compensated task number map (for TaskListTable badge)
    const map = await getCompensatedTaskNumbers();
    const obj: Record<string, number> = {};
    for (const [k, v] of map) obj[k] = v;
    return NextResponse.json(obj);
  } catch (e) {
    console.error("[claim-compensations] GET", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sku, comp_type, amount, note, tasks } = body;

    if (!sku || !comp_type) {
      return NextResponse.json(
        { error: "sku and comp_type are required" },
        { status: 400 }
      );
    }
    if (!VALID_TYPES.includes(comp_type)) {
      return NextResponse.json({ error: "Invalid comp_type" }, { status: 400 });
    }
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json(
        { error: "tasks array (with task_id + task_number) is required" },
        { status: 400 }
      );
    }

    const id = await insertBatch({
      sku,
      comp_type,
      amount: Number(amount ?? 0),
      note: note ?? null,
      tasks,
    });

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error("[claim-compensations] POST", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
