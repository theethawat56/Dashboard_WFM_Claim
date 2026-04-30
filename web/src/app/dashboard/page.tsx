"use client";

import { useEffect, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCards } from "./_components/KpiCards";
import type { SummaryData } from "./_components/KpiCards";
import { ModelBreakdownTable } from "./_components/ModelBreakdownTable";
import { MonthlyTrendChart } from "./_components/MonthlyTrendChart";
import { SymptomFrequencyChart } from "./_components/SymptomFrequencyChart";
import { DonutChartRepairClaim } from "./_components/DonutChartRepairClaim";
import { DailyTrendChart } from "./_components/DailyTrendChart";
import { DailyTopSkusCard } from "./_components/DailyTopSkusCard";
import { ClaimCompensationDialog } from "./_components/ClaimCompensationDialog";
import { ClaimCompTab } from "./_components/ClaimCompTab";
import { ClaimSummaryCard } from "./_components/ClaimSummaryCard";
import type { DailyTrendRow, DailyTopSkuRow, ClaimCompOverall } from "@/types/dashboard";
import { FilterBar } from "./_components/FilterBar";
import { ByModelTable } from "./_components/ByModelTable";
import type { ByModelRow } from "./_components/ByModelTable";
import { TaskListTable } from "./_components/TaskListTable";
import type { TaskRow } from "./_components/TaskListTable";
import { EvidenceExportPanel } from "./_components/EvidenceExportPanel";
import type { EvidenceSummary } from "./_components/EvidenceExportPanel";
import { ExportButtons } from "./_components/ExportButtons";
import type { UnclaimedClaimsSummary } from "@/lib/queries/unclaimedClaims";

const TYPE_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "repair", label: "ซ่อม" },
  { value: "claim", label: "เคลม" },
];
const PERIOD_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "3", label: "3 เดือน" },
  { value: "6", label: "6 เดือน" },
  { value: "12", label: "1 ปี" },
  { value: "18", label: "18 เดือน" },
];
const RISK_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "high", label: "สูงมาก" },
  { value: "medium", label: "กลาง" },
  { value: "low", label: "ต่ำ" },
];
const RECLAIM_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "true", label: "เคลมซ้ำเท่านั้น" },
  { value: "false", label: "ครั้งแรกเท่านั้น" },
];

export default function DashboardPage() {
  const [apiError, setApiError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "bymodel" | "tasks" | "evidence" | "claims"
  >("overview");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [trend, setTrend] = useState<{ month: string; repair_count: number; claim_count: number; reclaim_count: number; total: number }[]>([]);
  const [symptoms, setSymptoms] = useState<{ issue_group: string; frequency: number; related_skus: string | null }[]>([]);
  const [byModel, setByModel] = useState<ByModelRow[]>([]);
  const [taskResult, setTaskResult] = useState<{
    rows: TaskRow[];
    total: number;
    page: number;
    limit: number;
  }>({ rows: [], total: 0, page: 1, limit: 50 });
  const [skuList, setSkuList] = useState<string[]>([]);
  const [evidenceSummary, setEvidenceSummary] = useState<EvidenceSummary | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [selectedSku, setSelectedSku] = useState<string>("");
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [dailyTrend, setDailyTrend] = useState<DailyTrendRow[]>([]);
  const [dailyDays, setDailyDays] = useState(30);
  const [dailyTopSkus, setDailyTopSkus] = useState<DailyTopSkuRow[]>([]);
  const [topSkuDate, setTopSkuDate] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
  );
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // Claim compensation state
  const [compMap, setCompMap] = useState<Record<string, number>>({});
  const [compOverall, setCompOverall] = useState<ClaimCompOverall | null>(null);
  const [compDialogSku, setCompDialogSku] = useState<string | null>(null);
  const [compDialogModel, setCompDialogModel] = useState("");
  const [compDialogPreTask, setCompDialogPreTask] = useState<string | undefined>();
  const [compBySku, setCompBySku] = useState<Record<string, { total_amount: number; compensated_tasks: number }>>({});

  // Multi-select for "Claimed with Factory" report (Tab 3 -> Tab 1)
  const [claimedSelectedTaskNumbers, setClaimedSelectedTaskNumbers] = useState<
    Set<string>
  >(new Set());
  const [claimedSelectedTasks, setClaimedSelectedTasks] = useState<
    Record<string, TaskRow>
  >({});

  const [unclaimedSummary, setUnclaimedSummary] =
    useState<UnclaimedClaimsSummary | null>(null);
  const [unclaimedLoading, setUnclaimedLoading] = useState(false);

  const toggleClaimedTask = useCallback((row: TaskRow) => {
    setClaimedSelectedTaskNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(row.task_number)) {
        next.delete(row.task_number);
      } else {
        next.add(row.task_number);
      }
      return next;
    });

    setClaimedSelectedTasks((prev) => {
      if (prev[row.task_number]) {
        const { [row.task_number]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [row.task_number]: row };
    });
  }, []);

  useEffect(() => {
    // Compare "claimed already made" vs "unclaimed claims" (6 months) on Overview
    const run = async () => {
      try {
        setUnclaimedLoading(true);
        const exclude = Array.from(claimedSelectedTaskNumbers.values());
        const params = new URLSearchParams();
        params.set("months", "6");
        if (exclude.length) params.set("exclude", exclude.join(","));
        const res = await fetch(`/api/dashboard/unclaimed-claims?${params.toString()}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? `Unclaimed: ${res.status}`);
        }
        setUnclaimedSummary((await res.json()) as UnclaimedClaimsSummary);
      } catch (e) {
        console.error(e);
        setUnclaimedSummary(null);
      } finally {
        setUnclaimedLoading(false);
      }
    };
    run();
  }, [claimedSelectedTaskNumbers]);

  // Filters for By Model tab
  const [modelSearch, setModelSearch] = useState("");
  const [modelType, setModelType] = useState("all");
  const [modelDateFrom, setModelDateFrom] = useState("");
  const [modelDateTo, setModelDateTo] = useState("");
  const [modelRisk, setModelRisk] = useState("all");

  // Filters for Task List tab
  const [taskSearch, setTaskSearch] = useState("");
  const [taskType, setTaskType] = useState("all");
  const [taskSku, setTaskSku] = useState("");
  const [taskReclaim, setTaskReclaim] = useState("");
  const [taskFrom, setTaskFrom] = useState("");
  const [taskTo, setTaskTo] = useState("");
  const [taskWarrantyFrom, setTaskWarrantyFrom] = useState("");
  const [taskWarrantyTo, setTaskWarrantyTo] = useState("");
  const [taskPage, setTaskPage] = useState(1);

  const fetchSummary = useCallback(async () => {
    try {
      setApiError(null);
      const res = await fetch("/api/dashboard/summary");
      if (res.ok) {
        setSummary(await res.json());
      } else {
        const err = await res.json().catch(() => ({}));
        setApiError(err?.error ?? `Summary: ${res.status}`);
      }
    } catch (e) {
      console.error(e);
      setApiError("ไม่สามารถเชื่อมต่อ API ได้ ตรวจสอบ TURSO_DATABASE_URL และ TURSO_AUTH_TOKEN ใน web/.env.local");
    }
  }, []);

  const fetchTrend = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/trend");
      if (res.ok) setTrend(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchSymptoms = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/symptoms?limit=20");
      if (res.ok) setSymptoms(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchDailyTrend = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/daily-trend?days=${dailyDays}`);
      if (res.ok) setDailyTrend(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, [dailyDays]);

  const fetchDailyTopSkus = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/daily-top-skus?date=${topSkuDate}&limit=5`);
      if (res.ok) setDailyTopSkus(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, [topSkuDate]);

  const fetchCompMap = useCallback(async () => {
    try {
      const res = await fetch("/api/claim-compensations");
      if (res.ok) setCompMap(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchCompOverall = useCallback(async () => {
    try {
      const [overallRes, bySkuRes] = await Promise.all([
        fetch("/api/claim-compensations/summary"),
        fetch("/api/claim-compensations?view=sku-summary"),
      ]);
      if (overallRes.ok) setCompOverall(await overallRes.json());
      if (bySkuRes.ok) {
        const rows: { sku: string; total_amount: number; compensated_tasks: number }[] = await bySkuRes.json();
        const m: Record<string, { total_amount: number; compensated_tasks: number }> = {};
        for (const r of rows) m[r.sku] = { total_amount: r.total_amount, compensated_tasks: r.compensated_tasks };
        setCompBySku(m);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchByModel = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (modelType !== "all") params.set("type", modelType);
      if (modelDateFrom) params.set("dateFrom", modelDateFrom);
      if (modelDateTo) params.set("dateTo", modelDateTo);
      if (modelRisk !== "all") params.set("risk", modelRisk);
      if (modelSearch.trim()) params.set("sku", modelSearch.trim());
      const res = await fetch(`/api/dashboard/by-model?${params}`);
      if (res.ok) {
        const data = await res.json();
        setByModel(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [modelSearch, modelType, modelDateFrom, modelDateTo, modelRisk]);

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("page", String(taskPage));
      params.set("limit", "50");
      if (taskType !== "all") params.set("type", taskType);
      if (taskSku) params.set("sku", taskSku);
      if (taskReclaim !== "all" && taskReclaim) params.set("reclaim", taskReclaim);
      if (taskFrom) params.set("from", taskFrom);
      if (taskTo) params.set("to", taskTo);
      if (taskWarrantyFrom) params.set("warrantyFrom", taskWarrantyFrom);
      if (taskWarrantyTo) params.set("warrantyTo", taskWarrantyTo);
      if (taskSearch.trim()) params.set("search", taskSearch.trim());
      const res = await fetch(`/api/dashboard/tasks?${params}`);
      if (res.ok) setTaskResult(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, [
    taskPage,
    taskType,
    taskSku,
    taskReclaim,
    taskFrom,
    taskTo,
    taskWarrantyFrom,
    taskWarrantyTo,
    taskSearch,
  ]);

  const fetchSkuList = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/skus");
      if (res.ok) setSkuList(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchEvidence = useCallback(async (sku: string) => {
    if (!sku.trim()) {
      setEvidenceSummary(null);
      return;
    }
    setEvidenceLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard/evidence?sku=${encodeURIComponent(sku)}`
      );
      if (res.ok) {
        const rows = await res.json();
        const total = rows.length;
        const repair_count = rows.filter((r: { task_type: string }) => r.task_type === "repair").length;
        const claim_count = rows.filter((r: { task_type: string }) => r.task_type === "claim").length;
        const reclaim_count = rows.filter((r: { is_reclaim: number }) => r.is_reclaim === 1).length;
        const unfixed_count = rows.filter((r: { is_unfixed: number }) => r.is_unfixed === 1).length;
        const reclaim_pct = total > 0 ? (reclaim_count / total) * 100 : 0;
        const issueFreq: Record<string, number> = {};
        rows.forEach((r: { issue_group?: string }) => {
          const g = r.issue_group?.trim();
          if (g) issueFreq[g] = (issueFreq[g] ?? 0) + 1;
        });
        const top_symptoms = Object.entries(issueFreq)
          .map(([issue_group, count]) => ({ issue_group, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        const serialFreq: Record<string, number> = {};
        rows.forEach((r: { product_serial?: string }) => {
          const s = r.product_serial?.trim();
          if (s) serialFreq[s] = (serialFreq[s] ?? 0) + 1;
        });
        const serial_counts = Object.entries(serialFreq)
          .filter(([, c]) => c > 1)
          .map(([serial, count]) => ({ serial, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        const reclaim_chain = rows
          .filter((r: { ref_task_numbers?: string }) => r.ref_task_numbers?.trim())
          .map((r: { task_number: string; ref_task_numbers: string }) => `${r.task_number} → ${r.ref_task_numbers}`)
          .slice(0, 5);
        const claimRatio = total > 0 ? claim_count / total : 0;
        let risk_level: "high" | "medium" | "low" = "low";
        if (reclaim_count >= 3 || unfixed_count >= 2 || claimRatio > 0.6)
          risk_level = "high";
        else if (reclaim_count >= 1 || claimRatio > 0.3) risk_level = "medium";

        setEvidenceSummary({
          sku,
          model: rows[0]?.product_model ?? sku,
          total,
          repair_count,
          claim_count,
          reclaim_count,
          reclaim_pct,
          unfixed_count,
          top_symptoms,
          serial_counts,
          reclaim_chain,
          risk_level,
        });
      } else {
        setEvidenceSummary(null);
      }
    } catch (e) {
      console.error(e);
      setEvidenceSummary(null);
    } finally {
      setEvidenceLoading(false);
    }
  }, []);

  const handleResync = useCallback(async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/sync/resync", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setSyncMsg(
          `Sync สำเร็จ — ซ่อม ${data.repairFetched} รายการ, เคลม ${data.claimFetched} รายการ, อัพเดท ${data.totalUpserted} รายการ`
        );
        fetchSummary();
        fetchTrend();
        fetchDailyTrend();
        fetchDailyTopSkus();
        fetchByModel();
        fetchSymptoms();
      } else {
        setSyncMsg(`Sync ผิดพลาด: ${data.error}`);
      }
    } catch (e) {
      setSyncMsg(`Sync ผิดพลาด: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }, [fetchSummary, fetchTrend, fetchDailyTrend, fetchDailyTopSkus, fetchByModel, fetchSymptoms]);

  useEffect(() => {
    fetchSummary();
    fetchTrend();
    fetchSymptoms();
  }, [fetchSummary, fetchTrend, fetchSymptoms]);

  useEffect(() => {
    fetchDailyTrend();
  }, [fetchDailyTrend]);

  useEffect(() => {
    fetchDailyTopSkus();
  }, [fetchDailyTopSkus]);

  useEffect(() => {
    fetchCompMap();
    fetchCompOverall();
  }, [fetchCompMap, fetchCompOverall]);

  useEffect(() => {
    fetchByModel();
  }, [fetchByModel]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    fetchSkuList();
  }, [fetchSkuList]);

  useEffect(() => {
    if (selectedSku) fetchEvidence(selectedSku);
    else setEvidenceSummary(null);
  }, [selectedSku, fetchEvidence]);

  const top10ForChart = byModel.length ? byModel.slice(0, 10) : [];
  const filteredByModel = modelSearch.trim()
    ? byModel.filter(
        (r) =>
          r.sku.toLowerCase().includes(modelSearch.toLowerCase()) ||
          (r.model || "").toLowerCase().includes(modelSearch.toLowerCase())
      )
    : byModel;

  const claimedTasks = Object.values(claimedSelectedTasks);
  const claimedReport = (() => {
    if (claimedTasks.length === 0) {
      return {
        total: 0,
        reclaimCount: 0,
        unfixedCount: 0,
        uniqueSkuCount: 0,
        topIssueGroup: "",
      };
    }

    const reclaimCount = claimedTasks.filter((t) => t.is_reclaim === 1).length;
    const unfixedCount = claimedTasks.filter((t) => t.is_unfixed === 1).length;
    const uniqueSkuCount = new Set(
      claimedTasks.map((t) => (t.sku ?? "").trim()).filter(Boolean)
    ).size;

    const freq: Record<string, number> = {};
    for (const t of claimedTasks) {
      // For "Claimed with Factory" we prefer the detailed issue description
      const g = (t.issue_description ?? t.issue_group ?? "").trim();
      if (!g) continue;
      freq[g] = (freq[g] ?? 0) + 1;
    }
    const topIssueGroup =
      Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

    return {
      total: claimedTasks.length,
      reclaimCount,
      unfixedCount,
      uniqueSkuCount,
      topIssueGroup,
    };
  })();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {process.env.NEXT_PUBLIC_APP_TITLE ?? "Repair & Claim Dashboard"}
            </h1>
            <p className="text-sm text-slate-500">
              หลักฐานการเคลมโรงงาน — สถิติงานซ่อมและเคลม
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={syncing}
              onClick={handleResync}
              className="whitespace-nowrap"
            >
              {syncing ? (
                <>
                  <svg className="mr-1.5 h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  กำลัง Sync...
                </>
              ) : (
                <>
                  <svg className="mr-1.5 h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0115-6.7L21 8" />
                    <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 01-15 6.7L3 16" />
                  </svg>
                  Re-Sync (30 วัน)
                </>
              )}
            </Button>
            {syncMsg && (
              <p className={`max-w-xs text-right text-xs ${syncMsg.includes("ผิดพลาด") ? "text-red-600" : "text-green-600"}`}>
                {syncMsg}
              </p>
            )}
          </div>
        </div>
      </header>

      {apiError && (
        <div className="mx-auto max-w-[1440px] px-4 pt-4 lg:px-6">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {apiError}
            <span className="ml-2 font-medium">
              (ตรวจสอบว่า web/.env.local มี TURSO_DATABASE_URL และ TURSO_AUTH_TOKEN ถูกต้อง)
            </span>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          className="w-full"
        >
          <TabsList className="mb-4 w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
            <TabsTrigger value="bymodel">แยกตามรุ่น</TabsTrigger>
            <TabsTrigger value="tasks">รายการงาน</TabsTrigger>
            <TabsTrigger value="claims">ผลเคลม</TabsTrigger>
            <TabsTrigger value="evidence">หลักฐานต่อรอง</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <KpiCards data={summary} />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  สินค้า Top 5 ที่มีอัตราซ่อม/เคลมสูงสุดประจำวัน
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DailyTopSkusCard
                  data={dailyTopSkus}
                  date={topSkuDate}
                  onDateChange={setTopSkuDate}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  สรุปผลเคลมจากโรงงาน
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ClaimSummaryCard data={compOverall} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  รายงาน Claimed with Factory (งานที่เลือก)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {claimedTasks.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    ไปที่แท็บ <span className="font-medium">รายการงาน</span> แล้วกดปุ่ม{" "}
                    <span className="font-medium">Claimed</span> เพื่อเลือกงานที่ต้องการ จากนั้นกดปุ่ม{" "}
                    <span className="font-medium">สร้างรายงาน</span> เพื่อแสดงบนหน้านี้
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-3 text-sm text-slate-700">
                      <span>
                        งานที่เลือก: <b>{claimedReport.total}</b> รายการ
                      </span>
                      <span>
                        เคลมซ้ำ: <b>{claimedReport.reclaimCount}</b> รายการ
                      </span>
                      <span>
                        ซ่อมแล้วไม่หาย: <b>{claimedReport.unfixedCount}</b> รายการ
                      </span>
                      <span>
                        จำนวน SKU: <b>{claimedReport.uniqueSkuCount}</b>
                      </span>
                    </div>
                    {claimedReport.topIssueGroup && (
                      <p className="text-sm text-slate-600">
                        อาการที่พบมากที่สุด:{" "}
                        <span className="font-medium">{claimedReport.topIssueGroup}</span>
                      </p>
                    )}
                    {claimedTasks.length > 0 && (
                      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                        <table className="w-full text-left text-sm">
                          <thead className="border-b border-slate-200 bg-slate-50">
                            <tr>
                              <th className="px-3 py-2 font-medium text-slate-700">เลขงาน</th>
                              <th className="px-3 py-2 font-medium text-slate-700">SKU</th>
                              <th className="px-3 py-2 font-medium text-slate-700">รุ่น</th>
                              <th className="px-3 py-2 font-medium text-slate-700">Serial</th>
                              <th className="px-3 py-2 font-medium text-slate-700">อาการ</th>
                              <th className="px-3 py-2 font-medium text-slate-700">วันที่</th>
                            </tr>
                          </thead>
                          <tbody>
                            {claimedTasks
                              .slice()
                              .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
                              .slice(0, 50)
                              .map((t) => (
                                <tr
                                  key={t.task_number}
                                  className="border-b border-slate-100 hover:bg-slate-50"
                                >
                                  <td className="px-3 py-2 font-mono text-slate-800">
                                    {t.task_number}
                                  </td>
                                  <td className="px-3 py-2 font-mono text-slate-700">
                                    {t.sku ?? "-"}
                                  </td>
                                  <td className="px-3 py-2 text-slate-700">
                                    {t.product_model ?? "-"}
                                  </td>
                                  <td className="px-3 py-2 text-slate-700">
                                    {t.product_serial ?? "-"}
                                  </td>
                                  <td className="max-w-[220px] truncate px-3 py-2 text-slate-600">
                                    {((t.issue_description ?? t.issue_group) ?? "")
                                      .slice(0, 60)}
                                    {((t.issue_description ?? t.issue_group) ?? "").length >
                                      60
                                      ? "…"
                                      : ""}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600">
                                    {t.create_date ?? "-"}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setClaimedSelectedTaskNumbers(new Set());
                          setClaimedSelectedTasks({});
                        }}
                      >
                        ล้างการเลือก
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  เปรียบเทียบ: Unclaimed Claims (6 เดือนล่าสุด)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {unclaimedLoading ? (
                  <p className="text-sm text-slate-600">กำลังโหลดข้อมูล...</p>
                ) : unclaimedSummary ? (
                  <>
                    <div className="flex flex-wrap gap-3 text-sm text-slate-700">
                      <span>
                        Claimed (งานที่เลือก):{" "}
                        <b>{claimedReport.total}</b> รายการ
                      </span>
                      <span>
                        Claimed ซ้ำ: <b>{claimedReport.reclaimCount}</b> รายการ
                      </span>
                      <span>
                        Claimed ไม่หาย: <b>{claimedReport.unfixedCount}</b> รายการ
                      </span>
                      <span>
                        Claimed จำนวน SKU: <b>{claimedReport.uniqueSkuCount}</b>
                      </span>
                      <span>
                        Unclaimed: <b>{unclaimedSummary.total}</b> รายการ
                      </span>
                      <span>
                        เคลมซ้ำ: <b>{unclaimedSummary.reclaim_count}</b> รายการ
                      </span>
                      <span>
                        ซ่อมแล้วไม่หาย: <b>{unclaimedSummary.unfixed_count}</b> รายการ
                      </span>
                      <span>
                        จำนวน SKU: <b>{unclaimedSummary.unique_sku_count}</b>
                      </span>
                    </div>
                    {unclaimedSummary.top_issue_description && (
                      <p className="text-sm text-slate-600">
                        อาการที่พบมากที่สุด:{" "}
                        <span className="font-medium">
                          {unclaimedSummary.top_issue_description}
                        </span>
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-600">
                    ไม่มีข้อมูล unclaimed ในช่วง 6 เดือนล่าสุด
                  </p>
                )}
              </CardContent>
            </Card>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Top 10 รุ่นที่มียอดรวม (ซ่อม+เคลม)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ModelBreakdownTable data={top10ForChart} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    สัดส่วน งานซ่อม / เคลม / เคลมซ้ำ
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DonutChartRepairClaim
                    repairCount={summary?.repair_count ?? 0}
                    claimCount={summary?.claim_count ?? 0}
                    reclaimCount={summary?.reclaim_count ?? 0}
                  />
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  แนวโน้มรายวัน — ซ่อม / เคลม / เคลมซ้ำ
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DailyTrendChart
                  data={dailyTrend}
                  days={dailyDays}
                  onDaysChange={setDailyDays}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  แนวโน้มรายเดือน (18 เดือนล่าสุด)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MonthlyTrendChart data={trend} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  อาการเสียที่พบบ่อย (Top 15)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SymptomFrequencyChart data={symptoms} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bymodel" className="space-y-4">
            <FilterBar
              searchPlaceholder="ค้นหารุ่นหรือ SKU..."
              searchValue={modelSearch}
              onSearchChange={setModelSearch}
              typeOptions={TYPE_OPTIONS}
              typeValue={modelType}
              onTypeChange={setModelType}
              riskOptions={RISK_OPTIONS}
              riskValue={modelRisk}
              onRiskChange={setModelRisk}
              fromValue={modelDateFrom}
              toValue={modelDateTo}
              onFromChange={setModelDateFrom}
              onToChange={setModelDateTo}
              showSearch={true}
              showType={true}
              showPeriod={false}
              showRisk={true}
              showDateRange={true}
              onReset={() => {
                setModelSearch("");
                setModelType("all");
                setModelDateFrom("");
                setModelDateTo("");
                setModelRisk("all");
              }}
            />
            <ByModelTable
              rows={filteredByModel}
              onExportExcel={(sku, dateFrom, dateTo) => {
                const params = new URLSearchParams({ skus: sku });
                if (dateFrom) params.set("dateFrom", dateFrom);
                if (dateTo) params.set("dateTo", dateTo);
                window.open(`/api/export/excel?${params.toString()}`, "_blank");
              }}
              compBySku={compBySku}
            />
          </TabsContent>

          <TabsContent value="tasks" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Claimed with Factory (เลือกงาน)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-600">
                  จำนวนงานที่เลือก: <b>{claimedTasks.length}</b> รายการ
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={claimedTasks.length === 0}
                    onClick={() => setActiveTab("overview")}
                  >
                    สร้างรายงานบนหน้า ภาพรวม
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={claimedTasks.length === 0}
                    onClick={() => {
                      setClaimedSelectedTaskNumbers(new Set());
                      setClaimedSelectedTasks({});
                    }}
                  >
                    ล้างการเลือก
                  </Button>
                </div>
              </CardContent>
            </Card>

            <FilterBar
              searchPlaceholder="เลขงาน, ลูกค้า, รุ่น, Serial, SKU, Warranty ID..."
              searchValue={taskSearch}
              onSearchChange={setTaskSearch}
              typeOptions={TYPE_OPTIONS}
              typeValue={taskType}
              onTypeChange={setTaskType}
              skuOptions={skuList}
              skuValue={taskSku}
              onSkuChange={setTaskSku}
              fromValue={taskFrom}
              toValue={taskTo}
              onFromChange={setTaskFrom}
              onToChange={setTaskTo}
              warrantyFromValue={taskWarrantyFrom}
              warrantyToValue={taskWarrantyTo}
              onWarrantyFromChange={setTaskWarrantyFrom}
              onWarrantyToChange={setTaskWarrantyTo}
              showSearch={true}
              showType={true}
              showSku={true}
              showDateRange={true}
              showWarrantyRange={true}
              onReset={() => {
                setTaskSearch("");
                setTaskType("all");
                setTaskSku("");
                setTaskReclaim("all");
                setTaskFrom("");
                setTaskTo("");
                setTaskWarrantyFrom("");
                setTaskWarrantyTo("");
                setTaskPage(1);
              }}
            />
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-600">
                เคลมซ้ำ
              </label>
              <select
                value={taskReclaim}
                onChange={(e) => {
                  setTaskReclaim(e.target.value);
                  setTaskPage(1);
                }}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {RECLAIM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <TaskListTable
              rows={taskResult.rows}
              page={taskResult.page}
              total={taskResult.total}
              limit={taskResult.limit}
              onPageChange={setTaskPage}
              claimedSelected={claimedSelectedTaskNumbers}
              onToggleClaimed={toggleClaimedTask}
              compensationMap={compMap}
              onOpenCompensation={(row) => {
                if (!row.sku) return;
                setCompDialogSku(row.sku);
                setCompDialogModel(row.product_model ?? "");
                setCompDialogPreTask(row.task_number);
              }}
            />
          </TabsContent>

          <TabsContent value="claims" className="space-y-6">
            <ClaimCompTab />
          </TabsContent>

          <TabsContent value="evidence" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      เลือกรุ่นเพื่อ Export
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      รุ่น / SKU
                    </label>
                    <select
                      value={selectedSku}
                      onChange={(e) => setSelectedSku(e.target.value)}
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">-- เลือกรุ่น --</option>
                      {skuList.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </CardContent>
                </Card>
                <EvidenceExportPanel
                  summary={evidenceSummary}
                  loading={evidenceLoading}
                />
              </div>
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Bulk Export (หลายรุ่น)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-slate-600">
                      เลือกรุ่นจากตารางแยกตามรุ่น แล้วใช้ปุ่มด้านล่าง
                    </p>
                    <ExportButtons
                      sku={selectedSku || undefined}
                      skus={selectedSkus.size > 0 ? Array.from(selectedSkus) : undefined}
                      disabled={!selectedSku && selectedSkus.size === 0}
                    />
                    <p className="text-xs text-slate-500">
                      Export CSV / PDF / TXT ใช้รุ่นที่เลือกในช่อง &quot;เลือกรุ่นเพื่อ Export&quot;
                      ส่วน Export Excel ใช้รายการรุ่นที่ส่งใน URL (หรือทั้งหมดถ้าไม่ระบุ)
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {compDialogSku && (
        <ClaimCompensationDialog
          sku={compDialogSku}
          model={compDialogModel}
          preSelectTaskNumber={compDialogPreTask}
          onClose={() => {
            setCompDialogSku(null);
            setCompDialogPreTask(undefined);
          }}
          onSaved={() => {
            fetchCompMap();
            fetchCompOverall();
          }}
        />
      )}
    </div>
  );
}
