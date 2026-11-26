import { NextRequest, NextResponse } from "next/server";
import { isCompType } from "@/lib/compensation";
import { listOpenCases, replacementPoCost, submitDecision } from "@/lib/cases";
import { factoryByToken } from "@/lib/factories";
import { notifyDecision } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      token?: string;
      taskId?: string;
      decision?: string;
      compType?: string;
      amount?: number;
      note?: string;
      reason?: string;
    };
    const factory = await factoryByToken(String(body.token ?? ""));
    if (!factory) return NextResponse.json({ error: "Unknown factory link." }, { status: 404 });
    if (body.decision !== "approved" && body.decision !== "rejected") {
      return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
    }

    let amount: number | null = null;
    let note: string | null = null;
    let reason: string | null = null;

    if (body.decision === "approved") {
      if (!body.compType || !isCompType(body.compType)) {
        return NextResponse.json({ error: "Choose a compensation type." }, { status: 400 });
      }
      if (body.compType === "replacement") {
        const open = (await listOpenCases()).find((row) => row.id === body.taskId && row.factoryId === factory.id);
        amount = open ? await replacementPoCost(open.sku) : null;
        if (amount == null) {
          return NextResponse.json({ error: "No PO cost is available for this replacement unit." }, { status: 400 });
        }
      } else {
        amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
          return NextResponse.json({ error: "Enter an amount greater than 0 THB." }, { status: 400 });
        }
      }
      note = String(body.note ?? "").trim().slice(0, 2000) || null;
    } else {
      reason = String(body.reason ?? "").trim().slice(0, 2000);
      if (reason.length < 5) {
        return NextResponse.json({ error: "Enter a reason of at least 5 characters." }, { status: 400 });
      }
    }

    const saved = await submitDecision({
      factoryId: factory.id,
      taskId: String(body.taskId ?? ""),
      decision: body.decision,
      compType: body.decision === "approved" && body.compType && isCompType(body.compType) ? body.compType : null,
      amount,
      note,
      reason,
    });
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 409 });

    const updated = (await listOpenCases()).find((row) => row.id === body.taskId && row.factoryId === factory.id);
    if (updated) await notifyDecision(updated);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[factory-portal] decision", error);
    return NextResponse.json({ error: "Could not save this decision." }, { status: 500 });
  }
}
