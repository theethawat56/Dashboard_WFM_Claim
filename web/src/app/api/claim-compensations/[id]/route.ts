import { NextResponse } from "next/server";
import { deleteBatch } from "@/lib/queries/claimCompensations";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteBatch(Number(id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[claim-compensations] DELETE", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
