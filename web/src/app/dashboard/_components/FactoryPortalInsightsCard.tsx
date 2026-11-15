"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FactoryPortalInsights } from "@/lib/queries/factoryPortalDecisions";

const TYPE_LABEL: Record<string, string> = {
  cost_refund: "คืนต้นทุน",
  spare_parts: "อะไหล่",
  deduce: "หักรอบถัดไป",
  replacement: "สินค้าทดแทน",
};

const STATUS_LABEL: Record<string, string> = {
  proposed: "รอทีมตรวจ",
  confirmed: "ยืนยันแล้ว",
  rejected: "ปฏิเสธ",
  returned: "ตีกลับแล้ว",
};

const COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#e11d48"];

function days(value: number | null): string {
  if (value == null) return "—";
  return Number.isInteger(value) ? `${value} วัน` : `${value.toFixed(1)} วัน`;
}

function when(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium" });
}

export function FactoryPortalInsightsCard() {
  const [data, setData] = useState<FactoryPortalInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/dashboard/factory-portal/insights")
      .then(async (response) => {
        const body = (await response.json()) as FactoryPortalInsights & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "โหลดสรุปไม่สำเร็จ");
        setData(body);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "โหลดสรุปไม่สำเร็จ");
      });
  }, []);

  const chartRows =
    data?.weeks.map((week) => {
      const point: Record<string, string | number | null> = { label: week.label };
      for (const factory of data.factories) {
        point[factory.id] = week.byFactory[factory.id]?.medianDays ?? null;
      }
      return point;
    }) ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">ผลตอบโรงงาน และความเร็วรายสัปดาห์</CardTitle>
        <p className="text-sm text-slate-500">
          นับจากวันเปิดงานถึงวันที่โรงงานกดส่งคำตอบ ตามเวลาไทย สัปดาห์เริ่มวันจันทร์ ค่ายิ่งน้อยยิ่งตอบเร็ว
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>}
        {!data && !error && <p className="text-sm text-slate-500">กำลังโหลด…</p>}
        {data && data.replies === 0 && (
          <p className="text-sm text-slate-600">ยังไม่มีคำตอบจากโรงงาน จึงยังเทียบความเร็วรายสัปดาห์ไม่ได้</p>
        )}
        {data && data.replies > 0 && (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="คำตอบทั้งหมด" value={String(data.replies)} />
              <Stat label="เคลมได้" value={String(data.approved)} />
              <Stat label="ปฏิเสธ" value={String(data.rejected)} />
              <Stat
                label="มัธยฐานวันตอบกลับ"
                value={days(data.medianDays)}
                hint={
                  data.latestMedianDays == null
                    ? "เทียบจากงานที่มีวันเปิดงาน"
                    : data.previousMedianDays == null
                      ? `สัปดาห์ล่าสุด ${days(data.latestMedianDays)}`
                      : `สัปดาห์ล่าสุด ${days(data.latestMedianDays)} · สัปดาห์ก่อน ${days(data.previousMedianDays)}`
                }
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">โรงงาน</th>
                    <th className="px-2 py-2 font-medium">เคลมได้</th>
                    <th className="px-2 py-2 font-medium">รูปแบบที่รับ</th>
                    <th className="px-2 py-2 font-medium">ปฏิเสธ</th>
                    <th className="px-2 py-2 font-medium">มัธยฐานวันตอบ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.factories.map((factory) => (
                    <tr key={factory.id} className="border-t border-slate-100">
                      <td className="px-2 py-2 text-xs">{factory.name}</td>
                      <td className="px-2 py-2">{factory.approved}</td>
                      <td className="px-2 py-2 text-xs text-slate-600">
                        {Object.entries(factory.byType)
                          .filter(([, count]) => count > 0)
                          .map(([type, count]) => `${TYPE_LABEL[type] ?? type} ${count}`)
                          .join(" · ") || "—"}
                      </td>
                      <td className="px-2 py-2">{factory.rejected}</td>
                      <td className="px-2 py-2">{days(factory.medianDays)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-800">ความเร็วที่เคลมกลับมา เทียบทุกสัปดาห์</h3>
              {chartRows.length === 0 ? (
                <p className="text-sm text-slate-600">มีคำตอบแล้ว แต่ยังไม่มีวันเปิดงานสำหรับคำนวณความเร็ว</p>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} unit=" วัน" width={56} />
                      <Tooltip formatter={(value) => (value == null || value === "" ? "—" : `${value} วัน`)} />
                      <Legend />
                      {data.factories.map((factory, index) => (
                        <Line
                          key={factory.id}
                          type="monotone"
                          dataKey={factory.id}
                          name={factory.shortName}
                          stroke={COLORS[index % COLORS.length]}
                          strokeWidth={2}
                          connectNulls={false}
                          dot={{ r: 3 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {data.weeks.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="text-xs text-slate-500">
                      <tr>
                        <th className="px-2 py-2 font-medium">สัปดาห์ที่เริ่ม</th>
                        {data.factories.map((factory) => (
                          <th key={factory.id} className="px-2 py-2 font-medium">
                            {factory.shortName}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.weeks.map((week) => (
                        <tr key={week.weekStart} className="border-t border-slate-100">
                          <td className="px-2 py-2">{week.label}</td>
                          {data.factories.map((factory) => {
                            const point = week.byFactory[factory.id];
                            return (
                              <td key={factory.id} className="px-2 py-2 text-xs">
                                {point && point.count > 0 ? `${days(point.medianDays)} (${point.count})` : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <OutcomeList
                title="เคลมได้ เป็นรูปแบบไหน"
                empty="ยังไม่มีเคสที่โรงงานรับเคลม"
                rows={data.approvals.map((row) => ({
                  key: row.taskId,
                  title: row.taskNumber,
                  factory: row.factoryName,
                  detail: [
                    TYPE_LABEL[row.compType ?? ""] ?? row.compType,
                    row.amount != null ? `${row.amount.toLocaleString("th-TH")} บาท` : null,
                    row.note,
                    STATUS_LABEL[row.status] ?? row.status,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                  when: when(row.submittedAt),
                }))}
              />
              <OutcomeList
                title="ปฏิเสธ เพราะอะไร"
                empty="ยังไม่มีเคสที่โรงงานปฏิเสธ"
                rows={data.rejections.map((row) => ({
                  key: row.taskId,
                  title: row.taskNumber,
                  factory: row.factoryName,
                  detail: [row.reason, STATUS_LABEL[row.status] ?? row.status].filter(Boolean).join(" · "),
                  when: when(row.submittedAt),
                }))}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function OutcomeList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: { key: string; title: string; factory: string; detail: string; when: string }[];
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-slate-800">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600">{empty}</p>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {rows.map((row) => (
            <li key={row.key} className="rounded-md border border-slate-200 px-3 py-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-slate-900">{row.title}</p>
                <p className="text-xs text-slate-500">{row.when}</p>
              </div>
              <p className="text-xs text-slate-500">{row.factory}</p>
              <p className="mt-1 text-sm text-slate-700">{row.detail || "—"}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
