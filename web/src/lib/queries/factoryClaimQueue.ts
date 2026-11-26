import { getDb } from "../db";
import { resolveFactorySkus, skuInSql } from "../factoryClaimSkus";
import { ensureNewColumns } from "../migrate";
import { isTaskClosed, SQL_NOT_VOIDED } from "../taskStatus";
import { sqlDaysToRepairExpr } from "../warrantyBuffer";
import { ensureClaimCompTables } from "./claimCompensations";
import type { FactoryClaimQueueData, FactoryClaimQueueRow } from "@/types/dashboard";

const WARRANTY_DAYS = 365;
const ROW_LIMIT = 200;

const MISSING_SERIAL_SQL = `LOWER(TRIM(COALESCE(td.product_serial, ''))) IN ('', '-', 'n/a', 'none', 'null')`;
const MISSING_SYMPTOM_SQL = `TRIM(COALESCE(td.issue_group, '')) = '' AND TRIM(COALESCE(td.issue_description, '')) = ''`;

export async function getFactoryClaimQueue(): Promise<FactoryClaimQueueData> {
  await ensureNewColumns();
  await ensureClaimCompTables();
  const db = getDb();
  const skuFilter = skuInSql("td.sku", resolveFactorySkus(null));
  const daysExpr = `(${sqlDaysToRepairExpr()})`;
  const inWarranty = `${daysExpr} IS NOT NULL AND ${daysExpr} <= ${WARRANTY_DAYS}`;
  const baseFrom = `
    FROM tasks t
    JOIN task_details td ON td.task_id = t.id
    LEFT JOIN (
      SELECT task_id FROM claim_comp_batch_tasks GROUP BY task_id
    ) bt ON bt.task_id = t.id
    WHERE ${SQL_NOT_VOIDED}
      AND ${skuFilter.sql}
      AND ${inWarranty}
  `;

  const counts = await db.execute({
    sql: `
      SELECT
        SUM(CASE WHEN bt.task_id IS NULL THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN bt.task_id IS NULL AND t.task_type = 'claim' THEN 1 ELSE 0 END) as pending_clm,
        SUM(CASE WHEN bt.task_id IS NULL AND t.task_type = 'repair' THEN 1 ELSE 0 END) as pending_mnt,
        SUM(CASE WHEN bt.task_id IS NOT NULL THEN 1 ELSE 0 END) as claimed_count,
        SUM(CASE WHEN bt.task_id IS NOT NULL AND t.task_type = 'claim' THEN 1 ELSE 0 END) as claimed_clm,
        SUM(CASE WHEN bt.task_id IS NOT NULL AND t.task_type = 'repair' THEN 1 ELSE 0 END) as claimed_mnt,
        SUM(CASE
          WHEN bt.task_id IS NULL AND NOT (${MISSING_SERIAL_SQL}) AND NOT (${MISSING_SYMPTOM_SQL}) THEN 1
          ELSE 0
        END) as ready_count,
        SUM(CASE
          WHEN bt.task_id IS NULL AND t.task_type = 'claim' AND NOT (${MISSING_SERIAL_SQL}) AND NOT (${MISSING_SYMPTOM_SQL}) THEN 1
          ELSE 0
        END) as ready_clm,
        SUM(CASE
          WHEN bt.task_id IS NULL AND t.task_type = 'repair' AND NOT (${MISSING_SERIAL_SQL}) AND NOT (${MISSING_SYMPTOM_SQL}) THEN 1
          ELSE 0
        END) as ready_mnt
      ${baseFrom}
    `,
    args: skuFilter.args,
  });
  const countRow = counts.rows[0] as Record<string, unknown> | undefined;
  const pending = Number(countRow?.pending_count ?? 0);
  const pendingClm = Number(countRow?.pending_clm ?? 0);
  const pendingMnt = Number(countRow?.pending_mnt ?? 0);
  const claimed = Number(countRow?.claimed_count ?? 0);
  const claimedClm = Number(countRow?.claimed_clm ?? 0);
  const claimedMnt = Number(countRow?.claimed_mnt ?? 0);
  const ready = Number(countRow?.ready_count ?? 0);
  const readyClm = Number(countRow?.ready_clm ?? 0);
  const readyMnt = Number(countRow?.ready_mnt ?? 0);

  const listSql = `
      SELECT
        t.id,
        t.task_number,
        t.task_type,
        t.status,
        td.sku,
        td.product_model,
        td.product_serial,
        td.issue_description,
        td.issue_group,
        td.create_date,
        ${daysExpr} as days_from_register
      ${baseFrom}
        AND bt.task_id IS NULL
        AND t.task_type = ?
      ORDER BY ${daysExpr} DESC, t.timestamp ASC, t.task_number ASC
      LIMIT ${ROW_LIMIT}
  `;
  const [clmList, mntList] = await Promise.all([
    db.execute({ sql: listSql, args: [...skuFilter.args, "claim"] }),
    db.execute({ sql: listSql, args: [...skuFilter.args, "repair"] }),
  ]);
  const list = { rows: [...clmList.rows, ...mntList.rows] };

  const rows: FactoryClaimQueueRow[] = (list.rows as Record<string, unknown>[]).map((row) => {
    const serial = row.product_serial != null ? String(row.product_serial) : null;
    const group = row.issue_group != null ? String(row.issue_group).trim() : "";
    const desc = row.issue_description != null ? String(row.issue_description).trim() : "";
    const missingSerial = isBlankSerial(serial);
    const missingSymptom = !group && !desc;
    const taskType = row.task_type === "repair" ? "repair" : "claim";
    const status = row.status != null ? String(row.status) : null;
    const days = row.days_from_register != null ? Number(row.days_from_register) : null;
    const sku = row.sku != null ? String(row.sku).trim() : "";
    const model = row.product_model != null ? String(row.product_model).trim() : "";
    return {
      id: String(row.id ?? ""),
      task_number: String(row.task_number ?? ""),
      task_type: taskType,
      sku: sku || null,
      product_name: model || sku || null,
      product_serial: serial,
      issue: group || desc || null,
      create_date: row.create_date != null ? String(row.create_date) : null,
      days_from_register: Number.isFinite(days as number) ? days : null,
      is_closed: isTaskClosed(taskType, status),
      missing_serial: missingSerial,
      missing_symptom: missingSymptom,
      ready: !missingSerial && !missingSymptom,
    };
  });

  return {
    pending_count: pending,
    pending_clm: pendingClm,
    pending_mnt: pendingMnt,
    claimed_count: claimed,
    claimed_clm: claimedClm,
    claimed_mnt: claimedMnt,
    ready_count: ready,
    ready_clm: readyClm,
    ready_mnt: readyMnt,
    blocked_count: Math.max(pending - ready, 0),
    blocked_clm: Math.max(pendingClm - readyClm, 0),
    blocked_mnt: Math.max(pendingMnt - readyMnt, 0),
    rows,
    shown: rows.length,
  };
}

function isBlankSerial(value: string | null): boolean {
  const t = (value ?? "").trim().toLowerCase();
  return t === "" || t === "-" || t === "n/a" || t === "none" || t === "null";
}
