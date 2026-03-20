import { getDb } from "../db";

export interface UnclaimedClaimsSummary {
  total: number;
  reclaim_count: number;
  unfixed_count: number;
  unique_sku_count: number;
  top_issue_description: string;
}

function monthsCutoffMs(months: number): number {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.getTime();
}

export async function getUnclaimedClaimsSummary(
  opts: { months?: number; excludeTaskNumbers?: string[] }
): Promise<UnclaimedClaimsSummary> {
  const months = opts.months ?? 6;
  const excludeTaskNumbers = opts.excludeTaskNumbers ?? [];

  const db = getDb();
  const args: (string | number)[] = [];

  const cutoff = monthsCutoffMs(months);
  args.push(cutoff);

  const whereExtra: string[] = [];
  if (excludeTaskNumbers.length > 0) {
    whereExtra.push(
      `t.task_number NOT IN (${excludeTaskNumbers.map(() => "?").join(",")})`
    );
    args.push(...excludeTaskNumbers);
  }

  const whereExtraSql = whereExtra.length ? ` AND ${whereExtra.join(" AND ")}` : "";

  const summarySql = `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN t.is_reclaim = 1 THEN 1 ELSE 0 END) as reclaim_count,
      SUM(CASE WHEN t.is_unfixed = 1 THEN 1 ELSE 0 END) as unfixed_count,
      COUNT(DISTINCT td.sku) as unique_sku_count
    FROM tasks t
    JOIN task_details td ON t.id = td.task_id
    WHERE t.status != 'VOIDED'
      AND t.task_type = 'claim'
      AND t.timestamp >= ?
      ${whereExtraSql}
  `;

  const summaryRes = await db.execute({ sql: summarySql, args });
  const row = summaryRes.rows[0] as Record<string, unknown> | undefined;

  const uniqueSkuCount =
    row?.unique_sku_count != null ? Number(row.unique_sku_count) : 0;

  // Prefer issue_description for "top symptom"
  const topIssueSql = `
    SELECT
      COALESCE(NULLIF(TRIM(td.issue_description), ''), td.issue_group) as issue,
      COUNT(*) as freq
    FROM tasks t
    JOIN task_details td ON t.id = td.task_id
    WHERE t.status != 'VOIDED'
      AND t.task_type = 'claim'
      AND t.timestamp >= ?
      ${whereExtraSql}
      AND COALESCE(NULLIF(TRIM(td.issue_description), ''), td.issue_group) IS NOT NULL
      AND TRIM(COALESCE(NULLIF(TRIM(td.issue_description), ''), td.issue_group)) != ''
    GROUP BY issue
    ORDER BY freq DESC
    LIMIT 1
  `;

  const topIssueRes = await db.execute({ sql: topIssueSql, args });
  const topRow = topIssueRes.rows[0] as Record<string, unknown> | undefined;
  const topIssue = String(topRow?.issue ?? "");

  return {
    total: Number(row?.total ?? 0),
    reclaim_count: Number(row?.reclaim_count ?? 0),
    unfixed_count: Number(row?.unfixed_count ?? 0),
    unique_sku_count: uniqueSkuCount,
    top_issue_description: topIssue,
  };
}

