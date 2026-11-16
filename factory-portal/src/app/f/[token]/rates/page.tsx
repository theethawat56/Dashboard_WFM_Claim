import { notFound } from "next/navigation";
import { ClaimRates } from "@/components/ClaimRates";
import { listFactoryClaimRates } from "@/lib/claimRates";
import { listFactoryCases } from "@/lib/cases";
import { factoryByToken } from "@/lib/factories";

export const dynamic = "force-dynamic";

export default async function FactoryRatesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const factory = await factoryByToken(token);
  if (!factory) notFound();

  const [rates, cases] = await Promise.all([listFactoryClaimRates(factory.id), listFactoryCases(factory.id)]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <a href={`/f/${token}`} className="text-sm font-medium text-blue-700 hover:underline">
        Back to cases
      </a>
      <p className="mt-4 text-sm font-medium text-slate-500">Warranty claim portal</p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-950">{factory.name}</h1>
      <ClaimRates token={token} rates={rates} caseIds={cases.map((row) => row.id)} />
    </div>
  );
}
