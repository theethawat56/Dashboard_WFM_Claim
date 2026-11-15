import { getDb } from "./db";
import { ensurePortal } from "./factories";

const THAI = /[\u0E00-\u0E7F]/;
const PER_REQUEST = 24;

function notifyEmail(): string {
  return process.env.FACTORY_PORTAL_NOTIFY_EMAIL?.trim() || "theethawat56@gmail.com";
}

export async function translateMany(texts: string[]): Promise<Map<string, string>> {
  await ensurePortal();
  const unique = [...new Set(texts.map((text) => text.trim()).filter(Boolean))];
  const translated = new Map<string, string>();
  if (unique.length === 0) return translated;

  const db = getDb();
  const cachedRows = await db.execute(`SELECT source_text, english_text FROM factory_portal_translations`);
  const cached = new Map<string, string>();
  for (const row of cachedRows.rows) {
    const record = row as Record<string, unknown>;
    cached.set(String(record.source_text ?? ""), String(record.english_text ?? ""));
  }

  const pending: string[] = [];
  for (const text of unique) {
    const hit = cached.get(text);
    if (hit) {
      translated.set(text, hit);
      continue;
    }
    if (!THAI.test(text)) {
      translated.set(text, text);
      await saveTranslation(text, text);
      continue;
    }
    pending.push(text);
  }

  const batch = pending.slice(0, PER_REQUEST);
  await mapPool(batch, 4, async (text) => {
    const english = await translateOne(text);
    translated.set(text, english);
    if (english !== text && !english.includes("MYMEMORY WARNING")) await saveTranslation(text, english);
  });
  for (const text of pending.slice(PER_REQUEST)) translated.set(text, text);
  for (const text of batch) if (!translated.has(text)) translated.set(text, text);
  return translated;
}

async function mapPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function run(): Promise<void> {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
}

async function saveTranslation(source: string, english: string): Promise<void> {
  await getDb().execute({
    sql: `INSERT INTO factory_portal_translations (source_text, english_text)
          VALUES (?, ?)
          ON CONFLICT(source_text) DO UPDATE SET english_text = excluded.english_text`,
    args: [source, english],
  });
}

async function translateOne(text: string): Promise<string> {
  const query = text.slice(0, 450);
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", query);
  url.searchParams.set("langpair", "th|en");
  url.searchParams.set("de", notifyEmail());
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return text;
    const body = (await response.json()) as {
      responseStatus?: number;
      responseData?: { translatedText?: string };
    };
    const english = body.responseData?.translatedText?.trim() ?? "";
    if (body.responseStatus !== 200 || !english || english.includes("MYMEMORY WARNING")) return text;
    return text.length > 450 ? `${english}…` : english;
  } catch {
    return text;
  }
}
