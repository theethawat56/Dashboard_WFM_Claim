import { getDb } from "../db";
import { resolveFactorySkus, skuInSql } from "../factoryClaimSkus";
import { SQL_NOT_VOIDED } from "../taskStatus";
import { sqlInWarranty } from "../warrantyBuffer";
import { ensureClaimCompTables } from "./claimCompensations";
import { ensureFactorySubmissions } from "./factorySubmissions";
import { thisYearBounds } from "./modelFactoryStatus";
import type { FactoryOpenMonthData, FactoryOpenMonthRow } from "@/types/dashboard";

function monthsThrough(from: string, to: string): string[] {
  const months: string[] = [];
  let cursor = from.slice(0, 7);
  const end = to.slice(0, 7);
  while (cursor <= end) {
    months.push(cursor);
    const [year, month] = cursor.split("-").map(Number);
    cursor = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  }
  return months;
}

export async function getFactoryOpenMonths(): Promise<FactoryOpenMonthData> {
  await ensureClaimCompTables();
  await ensureFactorySubmissions();
  const db = getDb();
  const range = thisYearBounds();
  const skuFilter = skuInSql("td.sku", resolveFactorySkus(null));
  const created = `date(datetime(t.timestamp / 1000, 'unixepoch', '+7 hours'))`;
  const sent = `(fs.task_id IS NOT NULL OR bt.task_id IS NOT NULL)`;

  const result = await db.execute({
    sql: `
      SELECT
        strftime('%Y-%m', ${created}) AS month,
        SUM(CASE WHEN t.task_type = 'claim' AND NOT ${sent} THEN 1 ELSE 0 END) AS not_sent_clm,
        SUM(CASE WHEN t.task_type = 'claim' AND ${sent} THEN 1 ELSE 0 END) AS sent_clm,
        SUM(CASE WHEN t.task_type = 'repair' AND NOT ${sent} THEN 1 ELSE 0 END) AS not_sent_mnt,
        SUM(CASE WHEN t.task_type = 'repair' AND ${sent} THEN 1 ELSE 0 END) AS sent_mnt
      FROM tasks t
      JOIN task_details td ON td.task_id = t.id
      LEFT JOIN (
        SELECT task_id FROM claim_comp_batch_tasks GROUP BY task_id
      ) bt ON bt.task_id = t.id
      LEFT JOIN factory_submissions fs ON fs.task_id = t.id
      WHERE ${SQL_NOT_VOIDED}
        AND ${sqlInWarranty()}
        AND ${skuFilter.sql}
        AND ${created} >= ?
        AND ${created} <= ?
      GROUP BY month
    `,
    args: [...skuFilter.args, range.from, range.to],
  });

  const byMonth = new Map<string, FactoryOpenMonthRow>();
  for (const raw of result.rows) {
    const row = raw as Record<string, unknown>;
    const month = String(row.month ?? "");
    if (!month) continue;
    byMonth.set(month, {
      month,
      not_sent_clm: Number(row.not_sent_clm ?? 0),
      sent_clm: Number(row.sent_clm ?? 0),
      not_sent_mnt: Number(row.not_sent_mnt ?? 0),
      sent_mnt: Number(row.sent_mnt ?? 0),
    });
  }

  const rows = monthsThrough(range.from, range.to).map(
    (month) => byMonth.get(month) ?? { month, not_sent_clm: 0, sent_clm: 0, not_sent_mnt: 0, sent_mnt: 0 }
  );

  return {
    year: range.year,
    from: range.from,
    to: range.to,
    not_sent_clm: rows.reduce((sum, row) => sum + row.not_sent_clm, 0),
    sent_clm: rows.reduce((sum, row) => sum + row.sent_clm, 0),
    not_sent_mnt: rows.reduce((sum, row) => sum + row.not_sent_mnt, 0),
    sent_mnt: rows.reduce((sum, row) => sum + row.sent_mnt, 0),
    rows,
  };
}
