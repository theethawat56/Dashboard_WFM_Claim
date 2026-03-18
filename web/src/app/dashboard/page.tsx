"use client";

import { useEffect, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCards } from "./_components/KpiCards";
import type { SummaryData } from "./_components/KpiCards";
import { ModelBreakdownTable } from "./_components/ModelBreakdownTable";
import { MonthlyTrendChart } from "./_components/MonthlyTrendChart";
import { SymptomFrequencyChart } from "./_components/SymptomFrequencyChart";
import { DonutChartRepairClaim } from "./_components/DonutChartRepairClaim";
import { FilterBar } from "./_components/FilterBar";
import { ByModelTable } from "./_components/ByModelTable";
import type { ByModelRow } from "./_components/ByModelTable";
import { TaskListTable } from "./_components/TaskListTable";
import type { TaskRow } from "./_components/TaskListTable";
import { EvidenceExportPanel } from "./_components/EvidenceExportPanel";
import type { EvidenceSummary } from "./_components/EvidenceExportPanel";
import { ExportButtons } from "./_components/ExportButtons";

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

  // Filters for By Model tab
  const [modelSearch, setModelSearch] = useState("");
  const [modelType, setModelType] = useState("all");
  const [modelPeriod, setModelPeriod] = useState("all");
  const [modelRisk, setModelRisk] = useState("all");

  // Filters for Task List tab
  const [taskSearch, setTaskSearch] = useState("");
  const [taskType, setTaskType] = useState("all");
  const [taskSku, setTaskSku] = useState("");
  const [taskReclaim, setTaskReclaim] = useState("");
  const [taskFrom, setTaskFrom] = useState("");
  const [taskTo, setTaskTo] = useState("");
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

  const fetchByModel = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (modelType !== "all") params.set("type", modelType);
      if (modelPeriod !== "all") params.set("months", modelPeriod);
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
  }, [modelSearch, modelType, modelPeriod, modelRisk]);

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
      if (taskSearch.trim()) params.set("search", taskSearch.trim());
      const res = await fetch(`/api/dashboard/tasks?${params}`);
      if (res.ok) setTaskResult(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, [taskPage, taskType, taskSku, taskReclaim, taskFrom, taskTo, taskSearch]);

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

  useEffect(() => {
    fetchSummary();
    fetchTrend();
    fetchSymptoms();
  }, [fetchSummary, fetchTrend, fetchSymptoms]);

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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">
          {process.env.NEXT_PUBLIC_APP_TITLE ?? "Repair & Claim Dashboard"}
        </h1>
        <p className="text-sm text-slate-500">
          หลักฐานการเคลมโรงงาน — สถิติงานซ่อมและเคลม
        </p>
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
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-4 w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
            <TabsTrigger value="bymodel">แยกตามรุ่น</TabsTrigger>
            <TabsTrigger value="tasks">รายการงาน</TabsTrigger>
            <TabsTrigger value="evidence">หลักฐานต่อรอง</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <KpiCards data={summary} />
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
              periodOptions={PERIOD_OPTIONS}
              periodValue={modelPeriod}
              onPeriodChange={setModelPeriod}
              riskOptions={RISK_OPTIONS}
              riskValue={modelRisk}
              onRiskChange={setModelRisk}
              showSearch={true}
              showType={true}
              showPeriod={true}
              showRisk={true}
              onReset={() => {
                setModelSearch("");
                setModelType("all");
                setModelPeriod("all");
                setModelRisk("all");
              }}
            />
            <ByModelTable
              rows={filteredByModel}
              onExportExcel={(sku) =>
                window.open(
                  `/api/export/excel?skus=${encodeURIComponent(sku)}`,
                  "_blank"
                )
              }
            />
          </TabsContent>

          <TabsContent value="tasks" className="space-y-4">
            <FilterBar
              searchPlaceholder="เลขงาน, ลูกค้า, รุ่น, Serial, SKU..."
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
              showSearch={true}
              showType={true}
              showSku={true}
              showDateRange={true}
              onReset={() => {
                setTaskSearch("");
                setTaskType("all");
                setTaskSku("");
                setTaskReclaim("all");
                setTaskFrom("");
                setTaskTo("");
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
            />
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
    </div>
  );
}
