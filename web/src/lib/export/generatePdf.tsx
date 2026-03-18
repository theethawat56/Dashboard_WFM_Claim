import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// Use Helvetica so PDF renders reliably on server (Node has no XMLHttpRequest for font URL fetch).
// For Thai text in PDF, use Excel or TXT export, or add a local .ttf and Font.register with path.
const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 20 },
  subtitle: { fontSize: 12, marginBottom: 16 },
  table: { marginTop: 12 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, paddingVertical: 6 },
  cellHeader: { width: "30%", fontWeight: "bold" },
  cell: { width: "70%" },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 14, fontWeight: "bold", marginBottom: 8 },
  bullet: { marginLeft: 16, marginBottom: 4 },
  riskHigh: { backgroundColor: "#B71C1C", color: "white", padding: 4, alignSelf: "flex-start" },
  riskMedium: { backgroundColor: "#F57F17", color: "#000", padding: 4, alignSelf: "flex-start" },
  riskLow: { backgroundColor: "#2E7D32", color: "white", padding: 4, alignSelf: "flex-start" },
});

export interface PdfInput {
  sku: string;
  model: string;
  riskLevel: "high" | "medium" | "low";
  startDate: string;
  endDate: string;
  total: number;
  repairCount: number;
  claimCount: number;
  reclaimCount: number;
  reclaimPct: number;
  unfixedCount: number;
  topSymptom: string;
  reclaimChain: string[];
}

export function buildPdfDocument(input: PdfInput): React.ReactElement {
  const riskLabel =
    input.riskLevel === "high"
      ? "สูงมาก"
      : input.riskLevel === "medium"
        ? "กลาง"
        : "ต่ำ";
  const riskStyle =
    input.riskLevel === "high"
      ? styles.riskHigh
      : input.riskLevel === "medium"
        ? styles.riskMedium
        : styles.riskLow;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>รายงานหลักฐานการเคลมโรงงาน</Text>
        <Text style={styles.subtitle}>SKU: {input.sku}</Text>
        <Text style={styles.subtitle}>รุ่น: {input.model}</Text>
        <Text style={styles.subtitle}>
          วันที่: {input.startDate} – {input.endDate}
        </Text>
        <View style={[styles.subtitle, riskStyle]}>
          <Text>ระดับความเสี่ยง: {riskLabel}</Text>
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>สรุปสถิติ</Text>
        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={styles.cellHeader}>งานทั้งหมด</Text>
            <Text style={styles.cell}>{input.total}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cellHeader}>งานซ่อม</Text>
            <Text style={styles.cell}>{input.repairCount}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cellHeader}>งานเคลม</Text>
            <Text style={styles.cell}>{input.claimCount}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cellHeader}>เคลมซ้ำ</Text>
            <Text style={styles.cell}>{input.reclaimCount} ({input.reclaimPct.toFixed(1)}%)</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cellHeader}>ซ่อมแล้วไม่หาย</Text>
            <Text style={styles.cell}>{input.unfixedCount}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cellHeader}>อาการที่พบบ่อยที่สุด</Text>
            <Text style={styles.cell}>{input.topSymptom || "-"}</Text>
          </View>
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>งานที่อ้างอิงกัน (Reclaim chain)</Text>
        {input.reclaimChain.length > 0 ? (
          input.reclaimChain.map((line, i) => (
            <Text key={i} style={styles.bullet}>
              {line}
            </Text>
          ))
        ) : (
          <Text style={styles.bullet}>ไม่มี</Text>
        )}
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>จดหมายเรียกร้อง</Text>
        <Text style={styles.bullet}>
          เรียน [ชื่อโรงงาน]
        </Text>
        <Text style={styles.bullet}>
          จากการตรวจสอบข้อมูลงานซ่อมและเคลมของสินค้ารุ่น {input.model} SKU {input.sku}
          ระหว่างวันที่ {input.startDate} ถึง {input.endDate} พบปัญหาดังต่อไปนี้:
        </Text>
        <Text style={styles.bullet}>
          1. จำนวนงานซ่อมและเคลมรวมทั้งสิ้น {input.total} รายการ
        </Text>
        <Text style={styles.bullet}>
          2. มีการเคลมซ้ำ {input.reclaimCount} รายการ คิดเป็น {input.reclaimPct.toFixed(1)}% ของทั้งหมด
        </Text>
        <Text style={styles.bullet}>
          3. อาการที่พบซ้ำบ่อยที่สุด: {input.topSymptom || "-"}
        </Text>
        <Text style={styles.bullet}>
          4. มีสินค้าที่ซ่อมแล้วยังใช้งานไม่ได้ {input.unfixedCount} รายการ
        </Text>
        <Text style={styles.bullet}>
          จึงขอเรียกร้องให้โรงงานรับผิดชอบดังนี้:
        </Text>
        <Text style={styles.bullet}>
          □ ค่าซ่อมซ้ำ ({input.reclaimCount} ครั้ง × ค่าซ่อมเฉลี่ย)
        </Text>
        <Text style={styles.bullet}>
          □ ค่าขนส่งไป-กลับ ({input.reclaimCount} ครั้ง)
        </Text>
        <Text style={styles.bullet}>
          □ สินค้า DOA — เปลี่ยนใหม่ (ตามความเหมาะสม)
        </Text>
        <Text style={styles.bullet}>
          □ Extended warranty สำหรับ serial ที่มีปัญหา
        </Text>
      </Page>
    </Document>
  );
}

export function getPdfFilename(sku: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `evidence_${sku}_${date}.pdf`;
}
