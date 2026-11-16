import { notFound } from "next/navigation";
import { CaseBoard } from "@/components/CaseBoard";
import { listFactoryCases } from "@/lib/cases";
import { factoryByToken } from "@/lib/factories";
import { filesForTasks } from "@/lib/media";
import { translateMany } from "@/lib/translate";

export const dynamic = "force-dynamic";

export default async function FactoryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const factory = await factoryByToken(token);
  if (!factory) notFound();

  const cases = await listFactoryCases(factory.id);
  const english = await translateMany(cases.map((row) => row.symptomOriginal));
  let mediaUnavailable = false;
  const media = await filesForTasks(cases.map((row) => row.taskNumber)).catch((error: unknown) => {
    console.error("[factory media list]", error);
    mediaUnavailable = true;
    return new Map<string, { kind: "video" | "image"; label: string }[]>();
  });

  return (
    <CaseBoard
      token={token}
      factoryName={factory.name}
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
        files: (media.get(row.taskNumber) ?? []).map(({ kind, label }) => ({ kind, label })),
      }))}
      mediaUnavailable={mediaUnavailable}
    />
  );
}
