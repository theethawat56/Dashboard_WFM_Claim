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

const COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#e11d48", "#0891b2"];

function speedHint(latest: number | null, previous: number | null): string {
  if (latest == null) return "เทียบจากวันที่เคสขึ้นในลิงก์";
  if (previous == null) return `สัปดาห์ล่าสุด ${days(latest)}`;
  const delta = Math.round((latest - previous) * 10) / 10;
  const change = delta < 0 ? `เร็วขึ้น ${days(Math.abs(delta))}` : delta > 0 ? `ช้าลง ${days(delta)}` : "เท่ากับสัปดาห์ก่อน";
  return `สัปดาห์ล่าสุด ${days(latest)} · สัปดาห์ก่อน ${days(previous)} · ${change}`;
}

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
        point[`${factory.id}:clm`] = week.byFactory[factory.id]?.clm.medianDays ?? null;
        point[`${factory.id}:mnt`] = week.byFactory[factory.id]?.mnt.medianDays ?? null;
      }
      return point;
    }) ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">ผลตอบโรงงาน และความเร็วรายสัปดาห์</CardTitle>
        <p className="text-sm text-slate-500">
          นับจากวันที่เคสขึ้นในลิงก์โรงงานถึงวันที่โรงงานกดส่ง ตามเวลาไทย แยกงาน CLM (เคลม) กับงาน MNT (ซ่อม)
          เคสที่เปิดก่อนวันที่ 13 พ.ย. 2569 เริ่มนับจากวันนั้น เพราะเป็นวันแรกที่มีลิงก์ สัปดาห์เริ่มวันจันทร์ ค่ายิ่งน้อยยิ่งตอบเร็ว
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>}
        {!data && !error && <p className="text-sm text-slate-500">กำลังโหลด…</p>}
        {data && data.replies === 0 && (
          <p className="text-sm text-slate-600">ยังไม่มีคำตอบจากโรงงาน จึงยังเทียบความเร็วรายสัปดาห์ไม่ได้</p>
        )}
        {data && <WaitingTable factories={data.factories} />}
        {data && data.replies > 0 && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="คำตอบทั้งหมด" clm={String(data.repliesClm)} mnt={String(data.repliesMnt)} />
              <Stat label="เคลมได้" clm={String(data.approvedClm)} mnt={String(data.approvedMnt)} />
              <Stat label="ปฏิเสธ" clm={String(data.rejectedClm)} mnt={String(data.rejectedMnt)} />
              <Stat
                label="มัธยฐานวันตอบกลับ"
                clm={days(data.medianDaysClm)}
                mnt={days(data.medianDaysMnt)}
                hint={`CLM ${speedHint(data.latestMedianDaysClm, data.previousMedianDaysClm)} · MNT ${speedHint(data.latestMedianDaysMnt, data.previousMedianDaysMnt)}`}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">โรงงาน</th>
                    <th className="px-2 py-2 font-medium text-violet-800">CLM เคลมได้</th>
                    <th className="px-2 py-2 font-medium text-violet-800">CLM รูปแบบที่รับ</th>
                    <th className="px-2 py-2 font-medium text-violet-800">CLM ปฏิเสธ</th>
                    <th className="px-2 py-2 font-medium text-violet-800">CLM มัธยฐาน</th>
                    <th className="px-2 py-2 font-medium text-sky-800">MNT เคลมได้</th>
                    <th className="px-2 py-2 font-medium text-sky-800">MNT รูปแบบที่รับ</th>
                    <th className="px-2 py-2 font-medium text-sky-800">MNT ปฏิเสธ</th>
                    <th className="px-2 py-2 font-medium text-sky-800">MNT มัธยฐาน</th>
                  </tr>
                </thead>
                <tbody>
                  {data.factories.map((factory) => (
                    <tr key={factory.id} className="border-t border-slate-100">
                      <td className="px-2 py-2 text-xs">{factory.name}</td>
                      <td className="px-2 py-2">{factory.approvedClm}</td>
                      <td className="px-2 py-2 text-xs text-slate-600">{typeSummary(factory.byTypeClm)}</td>
                      <td className="px-2 py-2">{factory.rejectedClm}</td>
                      <td className="px-2 py-2">{days(factory.medianDaysClm)}</td>
                      <td className="px-2 py-2">{factory.approvedMnt}</td>
                      <td className="px-2 py-2 text-xs text-slate-600">{typeSummary(factory.byTypeMnt)}</td>
                      <td className="px-2 py-2">{factory.rejectedMnt}</td>
                      <td className="px-2 py-2">{days(factory.medianDaysMnt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-800">ความเร็วที่เคลมกลับมา เทียบทุกสัปดาห์</h3>
              {chartRows.length === 0 ? (
                <p className="text-sm text-slate-600">มีคำตอบแล้ว แต่ยังไม่มีวันที่ใช้คำนวณความเร็ว</p>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} unit=" วัน" width={56} />
                      <Tooltip formatter={(value) => (value == null || value === "" ? "—" : `${value} วัน`)} />
                      <Legend />
                      {data.factories.flatMap((factory, index) =>
                        (["clm", "mnt"] as const).map((kind) => (
                          <Line
                            key={`${factory.id}-${kind}`}
                            type="monotone"
                            dataKey={`${factory.id}:${kind}`}
                            name={`${factory.shortName} ${kind === "clm" ? "CLM" : "MNT"}`}
                            stroke={COLORS[index % COLORS.length]}
                            strokeWidth={2}
                            strokeDasharray={kind === "mnt" ? "5 4" : undefined}
                            connectNulls={false}
                            dot={{ r: 3 }}
                          />
                        ))
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {data.weeks.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="text-xs text-slate-500">
                      <tr>
                        <th className="px-2 py-2 font-medium" rowSpan={2}>
                          สัปดาห์ที่เริ่ม
                        </th>
                        {data.factories.map((factory) => (
                          <th key={factory.id} className="px-2 py-2 font-medium" colSpan={2}>
                            {factory.shortName}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {data.factories.flatMap((factory) => [
                          <th key={`${factory.id}-clm`} className="px-2 py-2 font-medium text-violet-800">
                            CLM
                          </th>,
                          <th key={`${factory.id}-mnt`} className="px-2 py-2 font-medium text-sky-800">
                            MNT
                          </th>,
                        ])}
                      </tr>
                    </thead>
                    <tbody>
                      {data.weeks.map((week) => (
                        <tr key={week.weekStart} className="border-t border-slate-100">
                          <td className="px-2 py-2">{week.label}</td>
                          {data.factories.map((factory) => {
                            const point = week.byFactory[factory.id];
                            return (
                              <WeekPair key={factory.id} clm={point?.clm} mnt={point?.mnt} />
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {(["clm", "mnt"] as const).map((kind) => (
              <div key={kind} className="space-y-3">
                <h3 className={`text-sm font-medium ${kind === "clm" ? "text-violet-800" : "text-sky-800"}`}>
                  {kind === "clm" ? "CLM เคลม" : "MNT ซ่อม"}
                </h3>
                <div className="grid gap-6 lg:grid-cols-2">
                  <OutcomeList
                    title="เคลมได้ เป็นรูปแบบไหน"
                    empty="ยังไม่มีเคสที่โรงงานรับเคลม"
                    rows={data.approvals.filter((row) => row.kind === kind).map(approvalItem)}
                  />
                  <OutcomeList
                    title="ปฏิเสธ เพราะอะไร"
                    empty="ยังไม่มีเคสที่โรงงานปฏิเสธ"
                    rows={data.rejections.filter((row) => row.kind === kind).map(rejectionItem)}
                  />
                </div>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function WaitingTable({ factories }: { factories: FactoryPortalInsights["factories"] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-slate-800">เคสที่ยังไม่ตอบ ใช้เร่งโรงงานที่ช้า</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="px-2 py-2 font-medium">โรงงาน</th>
              <th className="px-2 py-2 font-medium text-violet-800">CLM ยังไม่ตอบ</th>
              <th className="px-2 py-2 font-medium text-violet-800">CLM มัธยฐานค้าง</th>
              <th className="px-2 py-2 font-medium text-violet-800">CLM ค้างนานสุด</th>
              <th className="px-2 py-2 font-medium text-sky-800">MNT ยังไม่ตอบ</th>
              <th className="px-2 py-2 font-medium text-sky-800">MNT มัธยฐานค้าง</th>
              <th className="px-2 py-2 font-medium text-sky-800">MNT ค้างนานสุด</th>
            </tr>
          </thead>
          <tbody>
            {factories.map((factory) => (
              <tr key={factory.id} className="border-t border-slate-100">
                <td className="px-2 py-2 text-xs">{factory.shortName}</td>
                <td className="px-2 py-2">{factory.waitingCountClm}</td>
                <td className="px-2 py-2">{days(factory.medianWaitDaysClm)}</td>
                <td className="px-2 py-2">{days(factory.oldestWaitDaysClm)}</td>
                <td className="px-2 py-2">{factory.waitingCountMnt}</td>
                <td className="px-2 py-2">{days(factory.medianWaitDaysMnt)}</td>
                <td className="px-2 py-2">{days(factory.oldestWaitDaysMnt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function typeSummary(byType: Record<string, number>): string {
  return (
    Object.entries(byType)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `${TYPE_LABEL[type] ?? type} ${count}`)
      .join(" · ") || "—"
  );
}

function WeekPair({
  clm,
  mnt,
}: {
  clm?: { medianDays: number | null; count: number };
  mnt?: { medianDays: number | null; count: number };
}) {
  const cell = (slice?: { medianDays: number | null; count: number }) =>
    slice && slice.count > 0 ? `${days(slice.medianDays)} (${slice.count})` : "—";
  return (
    <>
      <td className="px-2 py-2 text-xs">{cell(clm)}</td>
      <td className="px-2 py-2 text-xs">{cell(mnt)}</td>
    </>
  );
}

function approvalItem(row: FactoryPortalInsights["approvals"][number]) {
  return {
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
  };
}

function rejectionItem(row: FactoryPortalInsights["rejections"][number]) {
  return {
    key: row.taskId,
    title: row.taskNumber,
    factory: row.factoryName,
    detail: [row.reason, STATUS_LABEL[row.status] ?? row.status].filter(Boolean).join(" · "),
    when: when(row.submittedAt),
  };
}

function Stat({ label, clm, mnt, hint }: { label: string; clm: string; mnt: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <div>
          <p className="text-[11px] font-medium text-violet-700">CLM</p>
          <p className="text-xl font-semibold text-slate-950">{clm}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-sky-700">MNT</p>
          <p className="text-xl font-semibold text-slate-950">{mnt}</p>
        </div>
      </div>
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
