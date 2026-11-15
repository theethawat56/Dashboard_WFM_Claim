import { notFound } from "next/navigation";
import { StaffTools } from "@/components/StaffTools";
import { factoryUrl, listFactories, staffTokenMatches } from "@/lib/factories";
import { openingDigestSentAt } from "@/lib/notify";

export const dynamic = "force-dynamic";

export default async function StaffPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!staffTokenMatches(token)) notFound();
  const factories = await listFactories();
  const sentAt = await openingDigestSentAt();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-slate-950">ลิงก์ส่งให้โรงงาน</h1>
      <p className="mt-2 text-sm text-slate-600">
        แต่ละโรงงานมีลิงก์ถาวรหนึ่งลิงก์ เปิดแล้วเห็นเฉพาะเคสของตัวเอง เป็นภาษาอังกฤษ คัดลอกแล้วส่งต่อได้
      </p>
      <ul className="mt-6 space-y-4">
        {factories.map((factory) => (
          <li key={factory.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="font-medium text-slate-950">{factory.name}</p>
            <a className="mt-2 block break-all text-sm text-blue-700" href={factoryUrl(factory.accessToken)}>
              {factoryUrl(factory.accessToken)}
            </a>
          </li>
        ))}
      </ul>
      <StaffTools token={token} openingSent={sentAt != null} />
    </main>
  );
}
