import { getDb } from "../db";
import type { ByModelRow } from "@/types/dashboard";
import type { RiskLevel } from "@/types/dashboard";

function applyRiskLevel(row: ByModelRow): ByModelRow {
  const total = row.total || 1;
  const claimRatio = row.claim_count / total;
  let risk: RiskLevel = "low";
  if (
    row.reclaim_count >= 3 ||
    row.unfixed_count >= 2 ||
    claimRatio > 0.6
  ) {
    risk = "high";
  } else if (row.reclaim_count >= 1 || claimRatio > 0.3) {
    risk = "medium";
  }
  return { ...row, risk_level: risk };
}

export interface ByModelFilters {
  sku?: string;
  type?: "repair" | "claim" | "all";
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
  risk?: "high" | "medium" | "low" | "all";
}

function applyDateConditions(
  conditions: string[],
  args: (string | number)[],
  dateFrom?: string,
  dateTo?: string
) {
  if (dateFrom) {
    conditions.push("t.timestamp >= ?");
    args.push(new Date(dateFrom).getTime());
  }
  if (dateTo) {
    conditions.push("t.timestamp <= ?");
    args.push(new Date(dateTo + "T23:59:59.999").getTime());
  }
}

export async function getByModel(filters: ByModelFilters = {}): Promise<ByModelRow[]> {
  const db = getDb();
  const conditions: string[] = [
    "t.status != 'VOIDED'",
    "td.sku IS NOT NULL",
    "TRIM(td.sku) != ''",
  ];
  const args: (string | number)[] = [];

  if (filters.sku) {
    conditions.push("td.sku = ?");
    args.push(filters.sku);
  }

  applyDateConditions(conditions, args, filters.dateFrom, filters.dateTo);

  if (filters.type && filters.type !== "all") {
    conditions.push("t.task_type = ?");
    args.push(filters.type);
  }

  const where = conditions.join(" AND ");
  const q = `
    SELECT
      td.sku as sku,
      td.product_model as model,
      COUNT(*) as total,
      SUM(CASE WHEN t.task_type = 'repair' THEN 1 ELSE 0 END) as repair_count,
      SUM(CASE WHEN t.task_type = 'claim'  THEN 1 ELSE 0 END) as claim_count,
      SUM(CASE WHEN t.is_reclaim = 1       THEN 1 ELSE 0 END) as reclaim_count,
      SUM(CASE WHEN t.is_unfixed = 1       THEN 1 ELSE 0 END) as unfixed_count
    FROM tasks t
    LEFT JOIN task_details td ON t.id = td.task_id
    WHERE ${where}
    GROUP BY td.sku, td.product_model
    ORDER BY total DESC
  `;
  const r = await db.execute({ sql: q, args });
  const rows: ByModelRow[] = r.rows.map((row: Record<string, unknown>) => ({
    sku: String(row.sku ?? ""),
    model: String(row.model ?? ""),
    total: Number(row.total ?? 0),
    repair_count: Number(row.repair_count ?? 0),
    claim_count: Number(row.claim_count ?? 0),
    reclaim_count: Number(row.reclaim_count ?? 0),
    unfixed_count: Number(row.unfixed_count ?? 0),
  }));

  const withExtras: ByModelRow[] = [];
  for (const row of rows) {
    const [topIssue, peakMonth] = await Promise.all([
      getTopIssueForSku(db, row.sku, filters.dateFrom, filters.dateTo),
      getPeakMonthForSku(db, row.sku, filters.dateFrom, filters.dateTo),
    ]);
    withExtras.push(
      applyRiskLevel({
        ...row,
        top_issue_group: topIssue ?? undefined,
        peak_month: peakMonth ?? undefined,
      })
    );
  }

  if (filters.risk && filters.risk !== "all") {
    return withExtras.filter((r) => r.risk_level === filters.risk);
  }
  return withExtras;
}

async function getTopIssueForSku(
  db: ReturnType<typeof getDb>,
  sku: string,
  dateFrom?: string,
  dateTo?: string
): Promise<string | null> {
  const conditions = ["t.status != 'VOIDED'", "td.sku = ?", "td.issue_group IS NOT NULL", "TRIM(td.issue_group) != ''"];
  const args: (string | number)[] = [sku];
  applyDateConditions(conditions, args, dateFrom, dateTo);
  const r = await db.execute({
    sql: `
      SELECT td.issue_group, COUNT(*) as cnt
      FROM tasks t
      JOIN task_details td ON t.id = td.task_id
      WHERE ${conditions.join(" AND ")}
      GROUP BY td.issue_group
      ORDER BY cnt DESC
      LIMIT 1
    `,
    args,
  });
  const row = r.rows[0] as { issue_group?: string } | undefined;
  return row?.issue_group ?? null;
}

async function getPeakMonthForSku(
  db: ReturnType<typeof getDb>,
  sku: string,
  dateFrom?: string,
  dateTo?: string
): Promise<string | null> {
  const conditions = ["t.status != 'VOIDED'", "td.sku = ?", "t.timestamp IS NOT NULL"];
  const args: (string | number)[] = [sku];
  applyDateConditions(conditions, args, dateFrom, dateTo);
  const r = await db.execute({
    sql: `
      SELECT strftime('%Y-%m', datetime(t.timestamp / 1000, 'unixepoch')) as month, COUNT(*) as cnt
      FROM tasks t
      JOIN task_details td ON t.id = td.task_id
      WHERE ${conditions.join(" AND ")}
      GROUP BY month
      ORDER BY cnt DESC
      LIMIT 1
    `,
    args,
  });
  const row = r.rows[0] as { month?: string } | undefined;
  return row?.month ?? null;
}
