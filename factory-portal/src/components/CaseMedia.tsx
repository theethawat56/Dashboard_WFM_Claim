"use client";

import { useState } from "react";

export type CaseMediaFile = {
  kind: "video" | "image";
  label: string;
};

export function CaseMedia({
  token,
  taskId,
  files,
  unavailable,
}: {
  token: string;
  taskId: string;
  files: CaseMediaFile[];
  unavailable: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openFile(index: number) {
    setOpen(index);
    setUrl(null);
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`/f/${token}/media?taskId=${encodeURIComponent(taskId)}&index=${index}`);
      const body = (await response.json()) as { url?: string };
      if (!response.ok || !body.url) throw new Error("open failed");
      setUrl(body.url);
    } catch {
      setError("This file could not be opened.");
    } finally {
      setLoading(false);
    }
  }

  if (unavailable) {
    return <p className="mt-3 text-sm text-slate-500">Videos and photos could not be loaded.</p>;
  }
  if (files.length === 0) {
    return <p className="mt-3 text-sm text-slate-500">No video or photos</p>;
  }

  return (
    <div className="mt-3">
      <p className="text-sm font-medium text-slate-800">Videos and photos</p>
      <ul className="mt-2 space-y-3">
        {files.map((file, index) => (
          <li key={`${file.label}-${index}`}>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100"
              onClick={() => void openFile(index)}
            >
              {file.kind === "video" ? `Play ${file.label}` : `View ${file.label}`}
            </button>
            {open === index && loading && <p className="mt-2 text-sm text-slate-500">Opening…</p>}
            {open === index && error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            {open === index && url && file.kind === "video" && (
              <video controls autoPlay playsInline className="mt-2 max-h-80 w-full rounded-md bg-black" src={url} />
            )}
            {open === index && url && file.kind === "image" && (
              <img alt={file.label} className="mt-2 max-h-80 rounded-md" src={url} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
