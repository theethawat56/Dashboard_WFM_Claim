"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatThaiNumber } from "@/lib/utils";

export interface EvidenceSummary {
  sku: string;
  model: string;
  total: number;
  repair_count: number;
  claim_count: number;
  reclaim_count: number;
  reclaim_pct: number;
  unfixed_count: number;
  top_symptoms: { issue_group: string; count: number }[];
  serial_counts: { serial: string; count: number }[];
  reclaim_chain: string[];
  risk_level: "high" | "medium" | "low";
}

export function EvidenceExportPanel({
  summary,
  loading,
}: {
  summary: EvidenceSummary | null;
  loading: boolean;
}) {
  const onExportExcel = (sku: string) => {
    window.open(`/api/export/excel?skus=${encodeURIComponent(sku)}`, "_blank");
  };
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">หลักฐานต่อรอง</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 rounded bg-slate-200" />
            <div className="h-24 rounded bg-slate-100" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">หลักฐานต่อรอง</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-500">เลือกรุ่น/SKU เพื่อดูสรุปหลักฐาน</p>
        </CardContent>
      </Card>
    );
  }

  const riskLabel =
    summary.risk_level === "high"
      ? "สูงมาก"
      : summary.risk_level === "medium"
        ? "กลาง"
        : "ต่ำ";
  const riskVariant =
    summary.risk_level === "high"
      ? "riskHigh"
      : summary.risk_level === "medium"
        ? "riskMedium"
        : "riskLow";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-mono text-slate-700">{summary.sku}</span>
            <span className="ml-2 text-slate-600">{summary.model}</span>
          </div>
          <Badge variant={riskVariant as "riskHigh" | "riskMedium" | "riskLow"}>
            {riskLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">
            สรุปสถิติ
          </p>
          <p className="text-sm text-slate-700">
            งานซ่อม {formatThaiNumber(summary.repair_count)} | งานเคลม{" "}
            {formatThaiNumber(summary.claim_count)} | รวม{" "}
            {formatThaiNumber(summary.total)}
          </p>
          <p className="text-sm text-slate-700">
            เคลมซ้ำ: {formatThaiNumber(summary.reclaim_count)} ครั้ง (
            {summary.reclaim_pct.toFixed(1)}% ของทั้งหมด)
          </p>
          <p className="text-sm text-slate-700">
            ซ่อมแล้วไม่หาย: {formatThaiNumber(summary.unfixed_count)} ครั้ง
          </p>
        </div>
        {summary.top_symptoms.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">
              อาการที่พบบ่อย
            </p>
            <ul className="list-inside list-disc text-sm text-slate-700">
              {summary.top_symptoms.slice(0, 5).map((s, i) => (
                <li key={i}>
                  {s.issue_group} — {formatThaiNumber(s.count)} ครั้ง
                </li>
              ))}
            </ul>
          </div>
        )}
        {summary.serial_counts.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">
              Serial ที่เสียซ้ำ (พบ &gt; 1 ครั้ง)
            </p>
            <ul className="list-inside list-disc text-sm text-slate-700">
              {summary.serial_counts.slice(0, 5).map((s, i) => (
                <li key={i}>
                  {s.serial} — {formatThaiNumber(s.count)} ครั้ง
                </li>
              ))}
            </ul>
          </div>
        )}
        {summary.reclaim_chain.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">
              งานที่อ้างอิงกัน (Reclaim chain)
            </p>
            <p className="font-mono text-xs text-slate-700">
              {summary.reclaim_chain.slice(0, 3).join(" → ")}
            </p>
          </div>
        )}
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">
            ข้อเรียกร้องที่แนะนำ
          </p>
          <ul className="space-y-1 text-sm text-slate-700">
            <li>□ ค่าซ่อมซ้ำ ({summary.reclaim_count} ครั้ง × ค่าซ่อมเฉลี่ย)</li>
            <li>□ ค่าขนส่งไป-กลับ ({summary.reclaim_count} ครั้ง)</li>
            <li>□ สินค้า DOA — เปลี่ยนใหม่ (ตามความเหมาะสม)</li>
            <li>□ Extended warranty สำหรับ serial ที่มีปัญหา</li>
          </ul>
        </div>
        <div className="pt-2">
          <Button
            size="sm"
            onClick={() => onExportExcel(summary.sku)}
          >
            Export Excel รายงานต่อรองโรงงาน
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
