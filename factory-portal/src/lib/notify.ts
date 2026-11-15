import { getDb } from "./db";
import { bangkokToday, isMondayBangkok, thisYearRange } from "./bangkok";
import { COMP_TYPES } from "./compensation";
import { listOpenCases, type PortalCase } from "./cases";
import { sendMail } from "./email";
import { ensurePortal, factoryUrl, listFactories } from "./factories";
import { translateMany } from "./translate";

type NotifyResult = {
  opening: string;
  fresh: string;
  weekly: string;
};

function compLabel(value: string | null): string {
  return COMP_TYPES.find((item) => item.value === value)?.label ?? value ?? "—";
}

async function stateValue(key: string): Promise<string | null> {
  const result = await getDb().execute({
    sql: `SELECT value FROM factory_portal_state WHERE key = ?`,
    args: [key],
  });
  const value = result.rows[0] ? (result.rows[0] as Record<string, unknown>).value : null;
  return value != null ? String(value) : null;
}

async function setState(key: string, value: string): Promise<void> {
  await getDb().execute({
    sql: `INSERT INTO factory_portal_state (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [key, value],
  });
}

async function hasLog(dedupeKey: string): Promise<boolean> {
  const result = await getDb().execute({
    sql: `SELECT dedupe_key FROM factory_portal_email_log WHERE dedupe_key = ?`,
    args: [dedupeKey],
  });
  return result.rows.length > 0;
}

async function writeLog(kind: string, dedupeKey: string, subject: string): Promise<void> {
  await getDb().execute({
    sql: `INSERT INTO factory_portal_email_log (kind, dedupe_key, subject) VALUES (?, ?, ?)
          ON CONFLICT(dedupe_key) DO NOTHING`,
    args: [kind, dedupeKey, subject],
  });
}

async function caseLines(cases: PortalCase[]): Promise<string> {
  const factories = await listFactories();
  const names = new Map(factories.map((factory) => [factory.id, factory.name]));
  const links = new Map(factories.map((factory) => [factory.id, factoryUrl(factory.accessToken)]));
  const english = await translateMany(cases.map((row) => row.symptomOriginal));
  return cases
    .map((row) => {
      const symptom = english.get(row.symptomOriginal) ?? row.symptomOriginal;
      return [
        `- ${row.taskNumber} | ${names.get(row.factoryId) ?? row.factoryId}`,
        `  รุ่น ${row.model || row.sku || "—"} | S/N ${row.serial || "—"} | เปิดงาน ${row.openedOn ?? "—"}`,
        `  อาการ: ${row.symptomOriginal || "—"}`,
        `  English: ${symptom || "—"}`,
        `  ลิงก์โรงงาน: ${links.get(row.factoryId) ?? "—"}`,
      ].join("\n");
    })
    .join("\n");
}

async function linkBlock(): Promise<string> {
  const factories = await listFactories();
  return factories.map((factory) => `${factory.name}\n${factoryUrl(factory.accessToken)}`).join("\n\n");
}

export async function openingDigestSentAt(): Promise<string | null> {
  await ensurePortal();
  return stateValue("opening_digest_sent");
}

export async function sendOpeningDigest(): Promise<{ ok: boolean; message: string }> {
  await ensurePortal();
  if (await stateValue("opening_digest_sent")) {
    return { ok: false, message: "ส่งสรุปวันเปิดใช้ไปแล้ว" };
  }
  const year = thisYearRange().year;
  const cases = await listOpenCases();
  const subject = `สรุปเคสเคลมปี ${year} ที่รอโรงงาน (${cases.length} รายการ)`;
  const text = [
    `เคสปี ${year} ที่ยังไม่บันทึกผลเคลม และพร้อมให้โรงงานตอบ มี ${cases.length} รายการ`,
    "",
    "ลิงก์ถาวรของแต่ละโรงงาน ส่งต่อให้โรงงานได้เลย",
    "",
    await linkBlock(),
    "",
    cases.length ? await caseLines(cases) : "ยังไม่มีเคสที่เข้าเงื่อนไข",
  ].join("\n");
  const sent = await sendMail(subject, text);
  if (!sent.sent) return { ok: false, message: sent.error ?? "ส่งเมลไม่สำเร็จ" };
  await setState("opening_digest_sent", new Date().toISOString());
  for (const row of cases) await writeLog("opening", `new:${row.id}`, subject);
  return { ok: true, message: `ส่งสรุป ${cases.length} รายการแล้ว` };
}

export async function notifyDecision(row: PortalCase): Promise<void> {
  await ensurePortal();
  const factories = await listFactories();
  const factory = factories.find((item) => item.id === row.factoryId);
  const approved = row.status === "proposed";
  const subject = approved
    ? `โรงงานตอบแล้ว ${row.taskNumber} — เสนอชดเชย`
    : `โรงงานตอบแล้ว ${row.taskNumber} — ปฏิเสธ`;
  const detail = approved
    ? `ประเภท: ${compLabel(row.compType)}\nจำนวน: ${row.amount ?? 0} บาท\nหมายเหตุ: ${row.note || "—"}`
    : `เหตุผล: ${row.reason || "—"}`;
  const text = [
    `${factory?.name ?? row.factoryId} กดตอบเคส ${row.taskNumber}`,
    `รุ่น ${row.model || row.sku || "—"} | S/N ${row.serial || "—"}`,
    detail,
    "",
    "เปิดแท็บเคลมโรงงานใน dashboard เดิม เพื่อยืนยันเข้าบันทึกผลเคลม หรือตีกลับให้เลือกใหม่",
    factory ? `ลิงก์โรงงาน: ${factoryUrl(factory.accessToken)}` : "",
  ].join("\n");
  const sent = await sendMail(subject, text);
  if (!sent.sent) {
    console.error("[factory-portal] decision email failed", sent.error);
    return;
  }
  await writeLog("decision", `decision:${row.id}:${row.status}:${new Date().toISOString()}`, subject);
}

export async function runDailyNotifications(): Promise<NotifyResult> {
  await ensurePortal();
  const result: NotifyResult = { opening: "already-sent", fresh: "none", weekly: "skipped" };
  if (!(await stateValue("opening_digest_sent"))) {
    const opening = await sendOpeningDigest();
    result.opening = opening.ok ? opening.message : opening.message;
    result.weekly = "skipped-on-opening-day";
    return result;
  }

  const cases = await listOpenCases();
  const fresh: PortalCase[] = [];
  for (const row of cases) {
    if (!(await hasLog(`new:${row.id}`))) fresh.push(row);
  }
  if (fresh.length > 0) {
    const subject = `เคสใหม่ที่โรงงานยังไม่ตอบ ${fresh.length} รายการ`;
    const text = ["มีเคสใหม่ที่เข้าเงื่อนไขและยังไม่ถูกส่งในเมลก่อนหน้า", "", await caseLines(fresh)].join("\n");
    const sent = await sendMail(subject, text);
    result.fresh = sent.sent ? `sent ${fresh.length}` : sent.error ?? "failed";
    if (sent.sent) {
      for (const row of fresh) await writeLog("new_case", `new:${row.id}`, subject);
    }
  }

  if (!isMondayBangkok()) return result;
  const weeklyKey = `weekly:${bangkokToday()}`;
  if (await hasLog(weeklyKey)) {
    result.weekly = "already-sent";
    return result;
  }
  const waiting = cases.filter((row) => row.status === "waiting" || row.status === "returned");
  if (waiting.length === 0) {
    await writeLog("weekly", weeklyKey, "ไม่มีเคสค้าง");
    result.weekly = "empty";
    return result;
  }
  const subject = `เตือนรายสัปดาห์ โรงงานยังไม่กด ${waiting.length} รายการ`;
  const text = ["เคสที่โรงงานยังไม่ได้กดอนุมัติหรือปฏิเสธ", "", await caseLines(waiting)].join("\n");
  const sent = await sendMail(subject, text);
  result.weekly = sent.sent ? `sent ${waiting.length}` : sent.error ?? "failed";
  if (sent.sent) await writeLog("weekly", weeklyKey, subject);
  return result;
}
