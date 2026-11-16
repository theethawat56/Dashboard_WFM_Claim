"use client";

import { Fragment } from "react";
import type { FactoryClaimRates } from "@/lib/claimRates";

function percent(value: number | null): string {
  if (value == null) return "—";
  return `${value.toFixed(2)}%`;
}

function count(value: number, singular: string): string {
  const label = value === 1 ? singular : `${singular}s`;
  return `${value.toLocaleString("en-US")} ${label}`;
}

export function ClaimRates({
  token,
  rates,
  caseIds,
}: {
  token: string;
  rates: FactoryClaimRates;
  caseIds: string[];
}) {
  const onPage = new Set(caseIds);
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Claim rate by purchase order</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Claim rate is the number of in-warranty claim cases matched to a purchase order and product, divided by the
            quantity on that order. Repair jobs are not included. The match uses the product and dates. It is not
            confirmed by serial number.
          </p>
        </div>
        <p className="text-sm text-slate-700">
          Overall <span className="font-semibold">{percent(rates.claimRatePct)}</span>
          <span className="text-slate-500">
            {" "}
            · {count(rates.claims, "claim")} / {count(rates.quantity, "unit")}
          </span>
        </p>
      </div>

      {rates.pos.length === 0 ? (
        <p className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
          No purchase orders are linked to your company yet.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {rates.pos.map((po) => (
            <article key={po.poId} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <h3 className="font-mono text-sm font-semibold text-slate-950">{po.poNumber || "Purchase order"}</h3>
                  <p className="text-xs text-slate-500">{po.poDate || "No PO date"}</p>
                </div>
                <p className="text-sm text-slate-800">
                  <span className="text-base font-semibold">{percent(po.claimRatePct)}</span>
                  <span className="text-slate-500">
                    {" "}
                    · {count(po.claims, "claim")} / {count(po.quantity, "unit")}
                  </span>
                </p>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Product</th>
                      <th className="px-4 py-2 font-medium">SKU</th>
                      <th className="px-4 py-2 text-right font-medium">PO quantity</th>
                      <th className="px-4 py-2 text-right font-medium">Claims</th>
                      <th className="px-4 py-2 text-right font-medium">Claim rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.lines.map((line) => (
                      <Fragment key={line.sku}>
                      <tr className="border-t border-slate-100">
                        <td className="px-4 py-2">{line.productName}</td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-600">{line.sku}</td>
                        <td className="px-4 py-2 text-right">{line.quantity.toLocaleString("en-US")}</td>
                        <td className="px-4 py-2 text-right">{line.claims.toLocaleString("en-US")}</td>
                        <td className="px-4 py-2 text-right font-medium">{percent(line.claimRatePct)}</td>
                      </tr>
                      {line.cases.length > 0 && (
                        <tr className="border-t border-slate-100 bg-slate-50">
                          <td colSpan={5} className="px-4 py-2">
                            <p className="text-xs font-medium text-slate-500">Cases in this purchase order</p>
                            <ul className="mt-1 space-y-1">
                              {line.cases.map((item) => (
                                <li key={item.taskId} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                                  {onPage.has(item.taskId) ? (
                                    <a
                                      className="font-medium text-blue-700 hover:underline"
                                      href={`/f/${token}#case-${item.taskId}`}
                                    >
                                      {item.taskNumber}
                                    </a>
                                  ) : (
                                    <span className="font-medium text-slate-800">{item.taskNumber}</span>
                                  )}
                                  <span className="text-xs text-slate-500">{item.openedOn || "No open date"}</span>
                                  {item.serial ? <span className="font-mono text-xs text-slate-500">{item.serial}</span> : null}
                                  {onPage.has(item.taskId) ? (
                                    <span className="text-xs text-slate-400">Open this case</span>
                                  ) : (
                                    <span className="text-xs text-slate-400">Not in the decision list</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
