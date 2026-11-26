import { getDb } from "../db";
import { bangkokDate } from "../bangkokDate";
import { resolveFactorySkus, skuInSql } from "../factoryClaimSkus";
import { SQL_NOT_VOIDED } from "../taskStatus";
import { sqlInWarranty } from "../warrantyBuffer";
import { ensureClaimCompTables } from "./claimCompensations";
import { ensureFactorySubmissions } from "./factorySubmissions";
import type { FactorySendStatus, ModelFactoryStatusData, ModelFactoryStatusRow } from "@/types/dashboard";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function thisYearBounds(now = new Date()): {
  year: number;
  from: string;
  to: string;
  min: string;
  max: string;
} {
  const today = bangkokDate(now);
  const year = Number(today.slice(0, 4));
  const min = `${year}-01-01`;
  const max = `${year}-12-31`;
  const to = today < min ? min : today > max ? max : today;
  return { year, from: min, to, min, max };
}

export function clampToYear(
  from: string | null | undefined,
  to: string | null | undefined,
  bounds = thisYearBounds()
): { year: number; from: string; to: string } {
  let start = from && ISO_DATE.test(from) ? from : bounds.from;
  let end = to && ISO_DATE.test(to) ? to : bounds.to;
  if (start < bounds.min) start = bounds.min;
  if (start > bounds.max) start = bounds.max;
  if (end < bounds.min) end = bounds.min;
  if (end > bounds.max) end = bounds.max;
  if (start > end) [start, end] = [end, start];
  return { year: bounds.year, from: start, to: end };
}

function sendStatus(units: number, waiting: number, compensated: number): FactorySendStatus {
  if (units > 0 && compensated >= units) return "compensated";
  if (waiting === 0 && compensated === 0) return "not_sent";
  if (waiting > 0 && compensated === 0 && waiting >= units) return "waiting";
  return "mixed";
}

export async function getModelFactoryStatus(
  fromRaw?: string | null,
  toRaw?: string | null
): Promise<ModelFactoryStatusData> {
  await ensureClaimCompTables();
  await ensureFactorySubmissions();
  const db = getDb();
  const range = clampToYear(fromRaw, toRaw);
  const skuFilter = skuInSql("td.sku", resolveFactorySkus(null));
  const created = `date(datetime(t.timestamp / 1000, 'unixepoch', '+7 hours'))`;

  const result = await db.execute({
    sql: `
      SELECT
        COALESCE(NULLIF(TRIM(td.product_model), ''), td.sku) AS model,
        COUNT(*) AS units,
        SUM(CASE WHEN t.task_type = 'claim' THEN 1 ELSE 0 END) AS units_clm,
        SUM(CASE WHEN t.task_type = 'repair' THEN 1 ELSE 0 END) AS units_mnt,
        SUM(CASE WHEN bt.task_id IS NULL AND fs.task_id IS NULL THEN 1 ELSE 0 END) AS not_sent,
        SUM(CASE WHEN t.task_type = 'claim' AND bt.task_id IS NULL AND fs.task_id IS NULL THEN 1 ELSE 0 END) AS not_sent_clm,
        SUM(CASE WHEN t.task_type = 'repair' AND bt.task_id IS NULL AND fs.task_id IS NULL THEN 1 ELSE 0 END) AS not_sent_mnt,
        SUM(CASE WHEN bt.task_id IS NULL AND fs.task_id IS NOT NULL THEN 1 ELSE 0 END) AS sent_waiting,
        SUM(CASE WHEN t.task_type = 'claim' AND bt.task_id IS NULL AND fs.task_id IS NOT NULL THEN 1 ELSE 0 END) AS sent_waiting_clm,
        SUM(CASE WHEN t.task_type = 'repair' AND bt.task_id IS NULL AND fs.task_id IS NOT NULL THEN 1 ELSE 0 END) AS sent_waiting_mnt,
        SUM(CASE WHEN bt.task_id IS NOT NULL THEN 1 ELSE 0 END) AS compensated,
        SUM(CASE WHEN t.task_type = 'claim' AND bt.task_id IS NOT NULL THEN 1 ELSE 0 END) AS compensated_clm,
        SUM(CASE WHEN t.task_type = 'repair' AND bt.task_id IS NOT NULL THEN 1 ELSE 0 END) AS compensated_mnt
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
      GROUP BY model
      ORDER BY units DESC, model ASC
    `,
    args: [...skuFilter.args, range.from, range.to],
  });

  const rows: ModelFactoryStatusRow[] = (result.rows as Record<string, unknown>[]).map((row) => {
    const units = Number(row.units ?? 0);
    const unitsClm = Number(row.units_clm ?? 0);
    const unitsMnt = Number(row.units_mnt ?? 0);
    const notSent = Number(row.not_sent ?? 0);
    const notSentClm = Number(row.not_sent_clm ?? 0);
    const notSentMnt = Number(row.not_sent_mnt ?? 0);
    const sentWaiting = Number(row.sent_waiting ?? 0);
    const sentWaitingClm = Number(row.sent_waiting_clm ?? 0);
    const sentWaitingMnt = Number(row.sent_waiting_mnt ?? 0);
    const compensated = Number(row.compensated ?? 0);
    const compensatedClm = Number(row.compensated_clm ?? 0);
    const compensatedMnt = Number(row.compensated_mnt ?? 0);
    return {
      model: String(row.model ?? ""),
      units,
      units_clm: unitsClm,
      units_mnt: unitsMnt,
      not_sent: notSent,
      not_sent_clm: notSentClm,
      not_sent_mnt: notSentMnt,
      sent_waiting: sentWaiting,
      sent_waiting_clm: sentWaitingClm,
      sent_waiting_mnt: sentWaitingMnt,
      compensated,
      compensated_clm: compensatedClm,
      compensated_mnt: compensatedMnt,
      status: sendStatus(units, sentWaiting, compensated),
    };
  });

  return {
    year: range.year,
    from: range.from,
    to: range.to,
    units: rows.reduce((sum, row) => sum + row.units, 0),
    units_clm: rows.reduce((sum, row) => sum + row.units_clm, 0),
    units_mnt: rows.reduce((sum, row) => sum + row.units_mnt, 0),
    not_sent: rows.reduce((sum, row) => sum + row.not_sent, 0),
    not_sent_clm: rows.reduce((sum, row) => sum + row.not_sent_clm, 0),
    not_sent_mnt: rows.reduce((sum, row) => sum + row.not_sent_mnt, 0),
    sent_waiting: rows.reduce((sum, row) => sum + row.sent_waiting, 0),
    sent_waiting_clm: rows.reduce((sum, row) => sum + row.sent_waiting_clm, 0),
    sent_waiting_mnt: rows.reduce((sum, row) => sum + row.sent_waiting_mnt, 0),
    compensated: rows.reduce((sum, row) => sum + row.compensated, 0),
    compensated_clm: rows.reduce((sum, row) => sum + row.compensated_clm, 0),
    compensated_mnt: rows.reduce((sum, row) => sum + row.compensated_mnt, 0),
    rows,
  };
}
