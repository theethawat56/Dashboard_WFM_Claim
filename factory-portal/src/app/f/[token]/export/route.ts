import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { listFactoryCases } from "@/lib/cases";
import { COMP_TYPES } from "@/lib/compensation";
import { factoryByToken } from "@/lib/factories";
import { translateMany } from "@/lib/translate";

export const dynamic = "force-dynamic";

const STATUS_LABEL = {
  waiting: "Needs your decision",
  returned: "Sent back",
  proposed: "Waiting for review",
  rejected: "Rejection waiting for review",
  confirmed: "Confirmed",
} as const;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const factory = await factoryByToken(token);
  if (!factory) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cases = await listFactoryCases(factory.id);
  const english = await translateMany(cases.map((row) => row.symptomOriginal));
  const rows = cases.map((row) => ({
    "Case no.": row.taskNumber,
    Model: row.model,
    SKU: row.sku,
    "Serial number": row.serial,
    Defect: english.get(row.symptomOriginal) ?? row.symptomOriginal,
    Opened: row.openedOn,
    "Day in warranty": row.daysInWarranty,
    Status: STATUS_LABEL[row.status],
    Compensation: COMP_TYPES.find((item) => item.value === row.compType)?.label ?? "",
    "Amount (THB)": row.amount,
    Note: row.note ?? "",
    "Rejection reason": row.reason ?? "",
  }));

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "Claims");
  const output = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(output), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="factory-claims-${factory.id}.xlsx"`,
    },
  });
}
