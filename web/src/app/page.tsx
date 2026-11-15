"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bangkokDate, formatThaiDate } from "@/lib/bangkokDate";
import { markDayStarted } from "@/lib/dayClient";
import type { DayWorkLog } from "@/lib/queries/daySession";

export default function StartPage() {
  const router = useRouter();
  const today = bangkokDate();
  const [logs, setLogs] = useState<DayWorkLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/day-session")
      .then(async (res) => {
        if (!res.ok) throw new Error("โหลดบันทึกไม่สำเร็จ");
        const data = (await res.json()) as { logs: DayWorkLog[] };
        setLogs(data.logs ?? []);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "โหลดบันทึกไม่สำเร็จ");
      })
      .finally(() => setLoading(false));
  }, []);

  const todayLog = logs.find((l) => l.work_date === today);
  const previous = logs.filter((l) => l.work_date !== today);

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-10">
        <p className="text-sm font-medium text-[#1565C0]">เริ่มต้นวันใหม่</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          {formatThaiDate(today)}
        </h1>
        <p className="mt-2 text-slate-600">
          หลังจบวัน ระบบจะพากลับมาหน้านี้ และเก็บบันทึกงานที่กด Claimed ไว้ในฐานข้อมูล
        </p>

        <div className="mt-8">
          <Button
            size="lg"
            onClick={() => {
              markDayStarted(today);
              router.push("/dashboard");
            }}
          >
            เริ่มงานวันนี้
          </Button>
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-base">ข้อมูลการทำงานที่บันทึกไว้</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            {loading && <p>กำลังตรวจสอบข้อมูลที่บันทึก...</p>}
            {error && <p className="text-red-700">{error}</p>}
            {!loading && !error && logs.length === 0 && (
              <p>ยังไม่มีบันทึก Claimed ในฐานข้อมูล หลังกด Claimed แล้วกดจบวัน รายการจะโชว์ที่นี่</p>
            )}
            {todayLog && (
              <p>
                วันนี้บันทึกแล้ว {todayLog.claimed_count} งาน
                {todayLog.status === "ended" ? " (จบวันแล้ว)" : " (ยังไม่จบวัน)"}
              </p>
            )}
            {previous.length > 0 && (
              <ul className="space-y-2">
                {previous.map((log) => (
                  <li key={log.work_date} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                    <span className="font-medium">{formatThaiDate(log.work_date)}</span>
                    {" — "}
                    Claimed {log.claimed_count} งาน
                    {log.status === "ended" ? " · จบวันแล้ว" : " · ยังไม่จบวัน"}
                    {log.claimed_task_numbers.length > 0 && (
                      <span className="mt-1 block font-mono text-xs text-slate-500">
                        {log.claimed_task_numbers.slice(0, 8).join(", ")}
                        {log.claimed_task_numbers.length > 8 ? " ..." : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
