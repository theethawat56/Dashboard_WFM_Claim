import { getDb } from "../db";
import { bangkokDate } from "../bangkokDate";
import { resolveFactorySkus, skuInSql } from "../factoryClaimSkus";
import { ensureNewColumns } from "../migrate";
import { isTaskClosed, SQL_NOT_VOIDED } from "../taskStatus";
import { sqlDaysToRepairExpr, sqlInWarranty } from "../warrantyBuffer";
import { ensureClaimCompTables } from "./claimCompensations";
import { listPortalFactories } from "./factoryPortalDecisions";
import { confirmedSkuFactories } from "./skuFactoryMap";
import { SQL_REAL_SERIAL, syncFactorySentMarks } from "./factorySent";
import type { FactoryClaimQueueData, FactoryClaimQueueRow } from "@/types/dashboard";

const ROW_LIMIT = 200;

const MISSING_SERIAL_SQL = `NOT (${SQL_REAL_SERIAL})`;
const MISSING_SYMPTOM_SQL = `TRIM(COALESCE(td.issue_group, '')) = '' AND TRIM(COALESCE(td.issue_description, '')) = ''`;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function getFactoryClaimQueue(opts?: {
  from?: string | null;
  to?: string | null;
  kind?: string | null;
  factory?: string | null;
}): Promise<FactoryClaimQueueData> {
  await ensureNewColumns();
  await ensureClaimCompTables();
  await syncFactorySentMarks();
  await confirmedSkuFactories();
  const db = getDb();
  const skuFilter = skuInSql("td.sku", resolveFactorySkus(null));
  const daysExpr = `(${sqlDaysToRepairExpr()})`;
  const inWarranty = sqlInWarranty();
  const opened = `date(datetime(t.timestamp / 1000, 'unixepoch', '+7 hours'))`;
  const extraSql: string[] = [];
  const extraArgs: string[] = [];
  if (opts?.from && ISO_DATE.test(opts.from)) {
    extraSql.push(`${opened} >= ?`);
    extraArgs.push(opts.from);
  }
  if (opts?.to && ISO_DATE.test(opts.to)) {
    extraSql.push(`${opened} <= ?`);
    extraArgs.push(opts.to);
  }
  if (opts?.kind === "clm") extraSql.push(`t.task_type = 'claim'`);
  if (opts?.kind === "mnt") extraSql.push(`t.task_type = 'repair'`);
  if (opts?.factory && opts.factory !== "all") {
    const portal = (await listPortalFactories()).find((factory) => factory.id === opts.factory);
    const needle = (portal?.match || opts.factory).toUpperCase();
    extraSql.push(`(
      EXISTS (
        SELECT 1 FROM sku_factory_map map
        WHERE map.sku = td.sku AND map.status = 'confirmed' AND map.factory_id = ?
      )
      OR (
        NOT EXISTS (
          SELECT 1 FROM sku_factory_map map
          WHERE map.sku = td.sku AND map.status IN ('confirmed', 'excluded')
        )
        AND EXISTS (
          SELECT 1 FROM po_case_matches m
          WHERE m.task_id = t.id AND UPPER(COALESCE(m.supplier_name, '')) LIKE ?
        )
      )
    )`);
    extraArgs.push(opts.factory, `%${needle}%`);
  }
  const extra = extraSql.length ? ` AND ${extraSql.join(" AND ")}` : "";
  const baseFrom = `
    FROM tasks t
    JOIN task_details td ON td.task_id = t.id
    LEFT JOIN (
      SELECT task_id FROM claim_comp_batch_tasks GROUP BY task_id
    ) bt ON bt.task_id = t.id
    LEFT JOIN factory_submissions fs ON fs.task_id = t.id
    WHERE ${SQL_NOT_VOIDED}
      AND ${skuFilter.sql}
      AND ${inWarranty}
      ${extra}
  `;

  const counts = await db.execute({
    sql: `
      SELECT
        SUM(CASE WHEN bt.task_id IS NULL AND fs.task_id IS NULL THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN bt.task_id IS NULL AND fs.task_id IS NULL AND t.task_type = 'claim' THEN 1 ELSE 0 END) as pending_clm,
        SUM(CASE WHEN bt.task_id IS NULL AND fs.task_id IS NULL AND t.task_type = 'repair' THEN 1 ELSE 0 END) as pending_mnt,
        SUM(CASE WHEN bt.task_id IS NOT NULL THEN 1 ELSE 0 END) as claimed_count,
        SUM(CASE WHEN bt.task_id IS NOT NULL AND t.task_type = 'claim' THEN 1 ELSE 0 END) as claimed_clm,
        SUM(CASE WHEN bt.task_id IS NOT NULL AND t.task_type = 'repair' THEN 1 ELSE 0 END) as claimed_mnt,
        SUM(CASE
          WHEN bt.task_id IS NULL AND fs.task_id IS NULL AND NOT (${MISSING_SERIAL_SQL}) AND NOT (${MISSING_SYMPTOM_SQL}) THEN 1
          ELSE 0
        END) as ready_count,
        SUM(CASE
          WHEN bt.task_id IS NULL AND fs.task_id IS NULL AND t.task_type = 'claim' AND NOT (${MISSING_SERIAL_SQL}) AND NOT (${MISSING_SYMPTOM_SQL}) THEN 1
          ELSE 0
        END) as ready_clm,
        SUM(CASE
          WHEN bt.task_id IS NULL AND fs.task_id IS NULL AND t.task_type = 'repair' AND NOT (${MISSING_SERIAL_SQL}) AND NOT (${MISSING_SYMPTOM_SQL}) THEN 1
          ELSE 0
        END) as ready_mnt
      ${baseFrom}
    `,
    args: [...skuFilter.args, ...extraArgs],
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
        AND fs.task_id IS NULL
        AND t.task_type = ?
      ORDER BY ${daysExpr} DESC, t.timestamp ASC, t.task_number ASC
      LIMIT ${ROW_LIMIT}
  `;
  const [clmList, mntList] = await Promise.all([
    db.execute({ sql: listSql, args: [...skuFilter.args, ...extraArgs, "claim"] }),
    db.execute({ sql: listSql, args: [...skuFilter.args, ...extraArgs, "repair"] }),
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

  const waitingResult = await db.execute({
    sql: `
      SELECT
        t.id, t.task_number, t.task_type, t.status, td.sku, td.product_model, td.product_serial,
        td.issue_description, td.issue_group, td.create_date, ${daysExpr} as days_from_register,
        CAST(julianday(?) - julianday(date(fs.sent_at)) AS INTEGER) AS wait_days
      ${baseFrom}
        AND bt.task_id IS NULL
        AND fs.sent_at IS NOT NULL
        AND instr(fs.sent_at, ':') > 0
        AND julianday(?) - julianday(date(fs.sent_at)) > 14
        AND NOT EXISTS (
          SELECT 1 FROM factory_portal_decisions d
          WHERE d.task_id = t.id AND d.status NOT IN ('waiting')
        )
      ORDER BY wait_days DESC
      LIMIT 200
    `,
    args: [bangkokDate(), ...skuFilter.args, ...extraArgs, bangkokDate()],
  });
  const waitingRows: FactoryClaimQueueRow[] = (waitingResult.rows as Record<string, unknown>[]).map((row) => {
    const serial = row.product_serial != null ? String(row.product_serial) : null;
    const group = row.issue_group != null ? String(row.issue_group).trim() : "";
    const desc = row.issue_description != null ? String(row.issue_description).trim() : "";
    const taskType = row.task_type === "repair" ? "repair" : "claim";
    const wait = Number(row.wait_days ?? 0);
    return {
      id: String(row.id ?? ""),
      task_number: String(row.task_number ?? ""),
      task_type: taskType,
      sku: row.sku != null ? String(row.sku).trim() || null : null,
      product_name: row.product_model != null ? String(row.product_model).trim() : null,
      product_serial: serial,
      issue: group || desc || null,
      create_date: row.create_date != null ? String(row.create_date) : null,
      days_from_register: row.days_from_register != null ? Number(row.days_from_register) : null,
      is_closed: isTaskClosed(taskType, row.status != null ? String(row.status) : null),
      missing_serial: isBlankSerial(serial),
      missing_symptom: !group && !desc,
      ready: false,
      days_waiting: wait,
      sla: wait > 21 ? "red" : "yellow",
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
    waiting_rows: waitingRows,
    shown: rows.length,
  };
}

function isBlankSerial(value: string | null): boolean {
  const compact = (value ?? "").trim().toLowerCase().replace(/[- ./]/g, "");
  return compact.length < 5;
}
