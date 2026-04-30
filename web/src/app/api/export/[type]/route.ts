import { NextRequest, NextResponse } from "next/server";
import { getEvidenceBySku } from "@/lib/queries/evidence";
import { getByModel } from "@/lib/queries/byModel";
import { getTasks } from "@/lib/queries/tasks";
import { getSymptoms } from "@/lib/queries/symptoms";
import { generateCsvFromEvidence, getCsvFilename } from "@/lib/export/generateCsv";
import {
  buildExcelBuffer,
  getExcelFilename,
  type ExcelInput,
} from "@/lib/export/generateExcel";
import {
  buildPdfDocument,
  getPdfFilename,
  type PdfInput,
} from "@/lib/export/generatePdf";
import { generateTxtDemandLetter, getTxtFilename } from "@/lib/export/generateTxt";
import { renderToBuffer } from "@react-pdf/renderer";

export const dynamic = "force-dynamic";

type ExportType = "csv" | "excel" | "pdf" | "txt";

function buildPdfInputFromEvidence(
  sku: string,
  model: string,
  rows: Awaited<ReturnType<typeof getEvidenceBySku>>
): PdfInput {
  const total = rows.length;
  const repairCount = rows.filter((r) => r.task_type === "repair").length;
  const claimCount = rows.filter((r) => r.task_type === "claim").length;
  const reclaimCount = rows.filter((r) => r.is_reclaim === 1).length;
  const unfixedCount = rows.filter((r) => r.is_unfixed === 1).length;
  const reclaimPct = total > 0 ? (reclaimCount / total) * 100 : 0;
  const claimRatio = total > 0 ? claimCount / total : 0;
  let riskLevel: "high" | "medium" | "low" = "low";
  if (reclaimCount >= 3 || unfixedCount >= 2 || claimRatio > 0.6) riskLevel = "high";
  else if (reclaimCount >= 1 || claimRatio > 0.3) riskLevel = "medium";

  const issueGroups = rows
    .map((r) => r.issue_group)
    .filter(Boolean) as string[];
  const freq: Record<string, number> = {};
  for (const g of issueGroups) {
    freq[g] = (freq[g] ?? 0) + 1;
  }
  const topSymptom =
    Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  const refChains: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const ref = r.ref_task_numbers?.trim();
    if (ref && !seen.has(ref)) {
      seen.add(ref);
      refChains.push(`${r.task_number} → ${ref}`);
    }
  }

  const timestamps = rows
    .map((r) => r.timestamp)
    .filter((t): t is number => t != null);
  const minTs = timestamps.length ? Math.min(...timestamps) : Date.now();
  const maxTs = timestamps.length ? Math.max(...timestamps) : Date.now();
  const startDate = new Date(minTs).toISOString().slice(0, 10);
  const endDate = new Date(maxTs).toISOString().slice(0, 10);

  return {
    sku,
    model,
    riskLevel,
    startDate,
    endDate,
    total,
    repairCount,
    claimCount,
    reclaimCount,
    reclaimPct,
    unfixedCount,
    topSymptom,
    reclaimChain: refChains,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  const exportType = type?.toLowerCase() as ExportType;
  if (!["csv", "excel", "pdf", "txt"].includes(exportType)) {
    return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const sku = searchParams.get("sku");
  const skusParam = searchParams.get("skus"); // comma-separated for excel
  const dateFrom = searchParams.get("dateFrom") ?? undefined;
  const dateTo = searchParams.get("dateTo") ?? undefined;
  const warrantyFrom = searchParams.get("warrantyFrom") ?? undefined;
  const warrantyTo = searchParams.get("warrantyTo") ?? undefined;

  try {
    if (exportType === "csv") {
      if (!sku?.trim()) {
        return NextResponse.json(
          { error: "Missing sku parameter for CSV export" },
          { status: 400 }
        );
      }
      const rows = await getEvidenceBySku(sku.trim(), {
        dateFrom,
        dateTo,
        warrantyFrom,
        warrantyTo,
      });
      const csv = generateCsvFromEvidence(rows);
      const filename = getCsvFilename(sku.trim());
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    if (exportType === "txt") {
      if (!sku?.trim()) {
        return NextResponse.json(
          { error: "Missing sku parameter for TXT export" },
          { status: 400 }
        );
      }
      const rows = await getEvidenceBySku(sku.trim());
      const model = rows[0]?.product_model ?? sku;
      const input = buildPdfInputFromEvidence(sku.trim(), model, rows);
      const txt = generateTxtDemandLetter(input);
      const filename = getTxtFilename(sku.trim());
      return new NextResponse(txt, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    if (exportType === "pdf") {
      if (!sku?.trim()) {
        return NextResponse.json(
          { error: "Missing sku parameter for PDF export" },
          { status: 400 }
        );
      }
      const rows = await getEvidenceBySku(sku.trim());
      const model = rows[0]?.product_model ?? sku;
      const input = buildPdfInputFromEvidence(sku.trim(), model, rows);
      const doc = buildPdfDocument(input);
      const buf = await renderToBuffer(doc);
      const body = new Uint8Array(buf);
      const filename = getPdfFilename(sku.trim());
      return new NextResponse(body, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(body.length),
        },
      });
    }

    if (exportType === "excel") {
      const skuList = skusParam
        ? skusParam.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      const [modelStats, taskResult, symptoms] = await Promise.all([
        getByModel({}),
        getTasks({ limit: 10000 }),
        getSymptoms(30),
      ]);
      const list = skuList.length > 0 ? skuList : modelStats.map((m) => m.sku).slice(0, 50);
      const evidenceBySku: Record<string, Awaited<ReturnType<typeof getEvidenceBySku>>> = {};
      for (const s of list) {
        evidenceBySku[s] = await getEvidenceBySku(s, {
          dateFrom,
          dateTo,
          warrantyFrom,
          warrantyTo,
        });
      }
      const modelStatsFiltered =
        skuList.length > 0
          ? modelStats.filter((m) => skuList.includes(m.sku))
          : modelStats;
      const evidenceSummary = modelStatsFiltered.map((m) => ({
        sku: m.sku,
        model: m.model,
        total: m.total,
        repair_count: m.repair_count,
        claim_count: m.claim_count,
        reclaim_count: m.reclaim_count,
        unfixed_count: m.unfixed_count,
        risk_level: m.risk_level,
      }));
      const input: ExcelInput = {
        modelStats: modelStatsFiltered,
        taskList: taskResult.rows,
        symptoms,
        evidenceSummary,
        evidenceBySku,
      };
      const buf = buildExcelBuffer(input);
      const body = new Uint8Array(buf);
      const filename = getExcelFilename();
      return new NextResponse(body, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(body.length),
        },
      });
    }

    return NextResponse.json({ error: "Unsupported export type" }, { status: 400 });
  } catch (e) {
    console.error("[export]", exportType, e);
    return NextResponse.json(
      { error: "Export failed" },
      { status: 500 }
    );
  }
}
