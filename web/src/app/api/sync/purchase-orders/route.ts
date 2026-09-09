import { NextResponse } from "next/server";
import { syncPurchaseOrders } from "@/lib/sync/zort";
import { ensureNewColumns } from "@/lib/migrate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(): Promise<NextResponse> {
  try {
    await ensureNewColumns();
    const result = await syncPurchaseOrders();
    return NextResponse.json({ ok: true, message: "ซิงก์ PO สำเร็จ", ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync/purchase-orders]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
