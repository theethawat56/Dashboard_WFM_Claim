import { NextRequest, NextResponse } from "next/server";
import { staffTokenMatches } from "@/lib/factories";
import { sendOpeningDigest } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { token?: string };
    if (!staffTokenMatches(String(body.token ?? ""))) {
      return NextResponse.json({ error: "ไม่พบหน้านี้" }, { status: 404 });
    }
    const result = await sendOpeningDigest();
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("[factory-portal opening]", error);
    return NextResponse.json({ error: "ส่งเมลไม่สำเร็จ" }, { status: 500 });
  }
}
