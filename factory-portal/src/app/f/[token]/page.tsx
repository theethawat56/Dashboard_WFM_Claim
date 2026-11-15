import { notFound } from "next/navigation";
import { CaseBoard } from "@/components/CaseBoard";
import { listFactoryClaimRates } from "@/lib/claimRates";
import { listFactoryCases } from "@/lib/cases";
import { factoryByToken } from "@/lib/factories";
import { translateMany } from "@/lib/translate";

export const dynamic = "force-dynamic";

export default async function FactoryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const factory = await factoryByToken(token);
  if (!factory) notFound();

  const [cases, rates] = await Promise.all([listFactoryCases(factory.id), listFactoryClaimRates(factory.id)]);
  const english = await translateMany(cases.map((row) => row.symptomOriginal));

  return (
    <CaseBoard
      token={token}
      factoryName={factory.name}
      rates={rates}
      cases={cases.map((row) => ({
        id: row.id,
        taskNumber: row.taskNumber,
        sku: row.sku,
        model: row.model,
        serial: row.serial,
        symptom: english.get(row.symptomOriginal) ?? row.symptomOriginal,
        openedOn: row.openedOn,
        daysInWarranty: row.daysInWarranty,
        status: row.status,
        compType: row.compType,
        amount: row.amount,
        note: row.note,
        reason: row.reason,
      }))}
    />
  );
}
