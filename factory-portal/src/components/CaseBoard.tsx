"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CaseMedia, type CaseMediaFile } from "@/components/CaseMedia";
import { COMP_TYPES, type CaseStatus, type CompType } from "@/lib/compensation";

export type BoardCase = {
  id: string;
  taskNumber: string;
  sku: string;
  model: string;
  serial: string;
  symptom: string;
  openedOn: string | null;
  daysInWarranty: number | null;
  status: CaseStatus;
  compType: string | null;
  amount: number | null;
  note: string | null;
  reason: string | null;
  files: CaseMediaFile[];
};

const STATUS_LABEL: Record<CaseStatus, string> = {
  waiting: "Needs your decision",
  returned: "Sent back — please choose again",
  proposed: "Submitted — waiting for our review",
  rejected: "Rejection submitted — waiting for our review",
  confirmed: "Confirmed",
};

function money(amount: number | null): string {
  if (amount == null) return "—";
  return `${amount.toLocaleString("en-US")} THB`;
}

function compLabel(value: string | null): string {
  return COMP_TYPES.find((item) => item.value === value)?.label ?? value ?? "—";
}

const THAI = /[\u0E00-\u0E7F]/;

function byNewest(a: BoardCase, b: BoardCase): number {
  if (a.openedOn !== b.openedOn) {
    if (!a.openedOn) return 1;
    if (!b.openedOn) return -1;
    return b.openedOn.localeCompare(a.openedOn);
  }
  return b.taskNumber.localeCompare(a.taskNumber);
}

function matchesSearch(row: BoardCase, needle: string): boolean {
  return [row.taskNumber, row.serial, row.model, row.sku].some((value) => value.toLowerCase().includes(needle));
}

export function CaseBoard({
  token,
  factoryName,
  cases,
  mediaUnavailable,
}: {
  token: string;
  factoryName: string;
  cases: BoardCase[];
  mediaUnavailable: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(cases);
  const [translating, setTranslating] = useState(false);
  const tried = useRef(new Set<string>());
  const [openId, setOpenId] = useState<string | null>(
    cases
      .filter((row) => row.status === "waiting" || row.status === "returned")
      .sort(byNewest)[0]?.id ?? null
  );
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [compType, setCompType] = useState<CompType>("cost_refund");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = needle ? rows.filter((row) => matchesSearch(row, needle)) : rows;
    return {
      visible,
      open: visible.filter((row) => row.status === "waiting" || row.status === "returned").sort(byNewest),
      review: visible.filter((row) => row.status === "proposed" || row.status === "rejected").sort(byNewest),
      confirmed: visible.filter((row) => row.status === "confirmed").sort(byNewest),
    };
  }, [rows, query]);

  useEffect(() => {
    setRows(cases);
  }, [cases]);

  useEffect(() => {
    function focusLinkedCase() {
      const taskId = decodeURIComponent(window.location.hash.replace(/^#case-/, ""));
      if (!window.location.hash.startsWith("#case-") || !taskId) return;
      const row = rows.find((item) => item.id === taskId);
      if (row && (row.status === "waiting" || row.status === "returned")) setOpenId(row.id);
      const element = document.getElementById(`case-${taskId}`);
      if (!element) return;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("ring-2", "ring-slate-900");
      window.setTimeout(() => element.classList.remove("ring-2", "ring-slate-900"), 1800);
    }
    focusLinkedCase();
    window.addEventListener("hashchange", focusLinkedCase);
    return () => window.removeEventListener("hashchange", focusLinkedCase);
  }, [rows]);

  useEffect(() => {
    const pending = [...new Set(rows.map((row) => row.symptom).filter((text) => THAI.test(text) && !tried.current.has(text)))].slice(0, 24);
    if (pending.length === 0) return;
    let cancel = false;
    setTranslating(true);
    void fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, texts: pending }),
    })
      .then(async (response) => {
        const body = response.ok
          ? ((await response.json()) as { translations?: Record<string, string> })
          : {};
        if (cancel) return;
        const translations = body.translations ?? {};
        for (const text of pending) {
          const next = translations[text];
          if (!next || next === text || THAI.test(next)) tried.current.add(text);
        }
        setRows((current) =>
          current.map((row) => {
            const next = translations[row.symptom];
            if (!next || next === row.symptom || THAI.test(next)) return row;
            return { ...row, symptom: next };
          })
        );
      })
      .catch(() => {
        for (const text of pending) tried.current.add(text);
      })
      .finally(() => {
        if (!cancel) setTranslating(false);
      });
    return () => {
      cancel = true;
    };
  }, [rows, token]);

  async function submit(row: BoardCase) {
    setError(null);
    const payload: Record<string, unknown> = { token, taskId: row.id, decision };
    if (decision === "approved") {
      const parsed = Number(amount);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("Enter a valid amount in THB. Use 0 if there is no cash amount.");
        return;
      }
      payload.compType = compType;
      payload.amount = parsed;
      payload.note = note.trim();
    } else if (reason.trim().length < 5) {
      setError("Enter a reason of at least 5 characters.");
      return;
    } else {
      payload.reason = reason.trim();
    }

    setSaving(true);
    try {
      const response = await fetch("/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not save this decision.");
        return;
      }
      setAmount("");
      setNote("");
      setReason("");
      router.refresh();
    } catch {
      setError("Could not save this decision.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">Warranty claim portal</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">{factoryName}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            These are this year&apos;s cases that are still inside the 365-day warranty, have a serial number and a defect
            description, and have not been recorded as compensated. Amounts are in Thai baht. Videos and
            photos from this case are listed on the case.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/f/${token}/rates`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            Claim rates
          </a>
          <a
            href={`/f/${token}/export`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            Export Excel
          </a>
        </div>
      </header>

      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Needs your decision" value={groups.open.length} />
        <Stat label="Waiting for our review" value={groups.review.length} />
        <Stat label="Confirmed" value={groups.confirmed.length} />
      </dl>

      <label className="mt-6 block text-sm text-slate-700">
        Find a case
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Case number, serial number, or model"
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950"
        />
      </label>
      {query.trim() && (
        <p className="mt-2 text-sm text-slate-500">
          {groups.visible.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")} cases
        </p>
      )}

      {translating && (
        <p className="mt-4 text-sm text-slate-500">Translating the remaining defect descriptions into English.</p>
      )}

      {rows.length === 0 && (
        <p className="mt-8 rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
          No cases are waiting for {factoryName} this year.
        </p>
      )}
      {rows.length > 0 && groups.visible.length === 0 && (
        <p className="mt-8 rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
          No cases match that search.
        </p>
      )}

      <CaseGroup title="Needs your decision" rows={groups.open} render={(row) => card(row)} />
      <CaseGroup title="Waiting for our review" rows={groups.review} render={(row) => card(row)} />
      <CaseGroup title="Confirmed" rows={groups.confirmed} render={(row) => card(row)} />
    </div>
  );

  function card(row: BoardCase) {
    return (
          <article id={`case-${row.id}`} key={row.id} className="scroll-mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-950">{row.taskNumber}</h2>
                <p className="text-sm text-slate-600">{row.model || row.sku || "Unknown model"}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                {STATUS_LABEL[row.status]}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <div>SKU: {row.sku || "—"}</div>
              <div>Serial number: {row.serial || "—"}</div>
              <div>Opened: {row.openedOn || "—"}</div>
              <div>Day in warranty: {row.daysInWarranty ?? "—"}</div>
            </dl>
            <p className="mt-3 text-sm text-slate-800">
              <span className="font-medium">Defect: </span>
              {row.symptom || "—"}
            </p>
            <CaseMedia token={token} taskId={row.id} files={row.files} unavailable={mediaUnavailable} />

            {(row.status === "proposed" || row.status === "confirmed") && (
              <p className="mt-3 text-sm text-slate-700">
                Offer: {compLabel(row.compType)} · {money(row.amount)}
                {row.note ? ` · ${row.note}` : ""}
              </p>
            )}
            {row.status === "rejected" && row.reason && (
              <p className="mt-3 text-sm text-slate-700">Rejection reason: {row.reason}</p>
            )}
            {row.status === "returned" && (
              <p className="mt-3 text-sm text-amber-800">
                This case was sent back. Choose the compensation again, or reject it with a reason.
                {row.reason ? ` Previous reason: ${row.reason}` : ""}
              </p>
            )}

            {(row.status === "waiting" || row.status === "returned") && (
              <div className="mt-4">
                {openId !== row.id ? (
                  <button
                    type="button"
                    className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                    onClick={() => {
                      setOpenId(row.id);
                      setError(null);
                      setDecision("approved");
                      setAmount("");
                      setNote("");
                      setReason("");
                    }}
                  >
                    Decide
                  </button>
                ) : (
                  <form
                    className="space-y-3 rounded-md bg-slate-50 p-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submit(row);
                    }}
                  >
                    <div className="flex flex-wrap gap-4 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={decision === "approved"} onChange={() => setDecision("approved")} />
                        Approve compensation
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={decision === "rejected"} onChange={() => setDecision("rejected")} />
                        Reject
                      </label>
                    </div>
                    {decision === "approved" ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm">
                          Compensation
                          <select
                            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2"
                            value={compType}
                            onChange={(event) => setCompType(event.target.value as CompType)}
                          >
                            {COMP_TYPES.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm">
                          Amount (THB)
                          <input
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2"
                            inputMode="decimal"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                          />
                        </label>
                        <label className="block text-sm sm:col-span-2">
                          Note
                          <textarea
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2"
                            rows={3}
                            maxLength={2000}
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                          />
                        </label>
                      </div>
                    ) : (
                      <label className="block text-sm">
                        Reason
                        <textarea
                          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2"
                          rows={3}
                          maxLength={2000}
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                        />
                      </label>
                    )}
                    {error && <p className="text-sm text-red-700">{error}</p>}
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {saving ? "Saving…" : "Submit decision"}
                    </button>
                  </form>
                )}
              </div>
            )}
          </article>
    );
  }
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value.toLocaleString("en-US")}</dd>
    </div>
  );
}

function CaseGroup({
  title,
  rows,
  render,
}: {
  title: string;
  rows: BoardCase[];
  render: (row: BoardCase) => ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-8 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {rows.map((row) => render(row))}
    </section>
  );
}
