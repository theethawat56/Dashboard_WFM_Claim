import type { PdfInput } from "./generatePdf";

export function generateTxtDemandLetter(input: PdfInput): string {
  const lines: string[] = [];
  lines.push("เรียน [ชื่อโรงงาน]");
  lines.push("");
  lines.push(
    `จากการตรวจสอบข้อมูลงานซ่อมและเคลมของสินค้ารุ่น ${input.model} SKU ${input.sku} ระหว่างวันที่ ${input.startDate} ถึง ${input.endDate} พบปัญหาดังต่อไปนี้:`
  );
  lines.push("");
  lines.push(`1. จำนวนงานซ่อมและเคลมรวมทั้งสิ้น ${input.total} รายการ`);
  lines.push(`2. มีการเคลมซ้ำ ${input.reclaimCount} รายการ คิดเป็น ${input.reclaimPct.toFixed(1)}% ของทั้งหมด`);
  lines.push(`3. อาการที่พบซ้ำบ่อยที่สุด: ${input.topSymptom || "-"}`);
  lines.push(`4. มีสินค้าที่ซ่อมแล้วยังใช้งานไม่ได้ ${input.unfixedCount} รายการ`);
  lines.push("");
  lines.push("จึงขอเรียกร้องให้โรงงานรับผิดชอบดังนี้:");
  lines.push("□ ค่าซ่อมซ้ำ (" + input.reclaimCount + " ครั้ง × ค่าซ่อมเฉลี่ย)");
  lines.push("□ ค่าขนส่งไป-กลับ (" + input.reclaimCount + " ครั้ง)");
  lines.push("□ สินค้า DOA — เปลี่ยนใหม่ (ตามความเหมาะสม)");
  lines.push("□ Extended warranty สำหรับ serial ที่มีปัญหา");
  lines.push("");
  return lines.join("\n");
}

export function getTxtFilename(sku: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `demand_letter_${sku}_${date}.txt`;
}
