import { NextRequest, NextResponse } from "next/server";
import { factoryByToken } from "@/lib/factories";
import { translateMany } from "@/lib/translate";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { token?: string; texts?: unknown };
    const factory = await factoryByToken(String(body.token ?? ""));
    if (!factory) return NextResponse.json({ error: "Unknown factory link." }, { status: 404 });
    const texts = Array.isArray(body.texts) ? body.texts.map((text) => String(text)).slice(0, 24) : [];
    const translated = await translateMany(texts);
    return NextResponse.json({ translations: Object.fromEntries(translated) });
  } catch (error) {
    console.error("[factory-portal] translate", error);
    return NextResponse.json({ error: "Translation failed." }, { status: 500 });
  }
}
