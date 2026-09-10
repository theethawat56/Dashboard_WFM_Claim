"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FACTORY_CLAIM_SKUS } from "@/lib/factoryClaimSkus";

export function SkuExcelFilter({
  selected,
  onChange,
  nameBySku,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  nameBySku?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return FACTORY_CLAIM_SKUS;
    return FACTORY_CLAIM_SKUS.filter((sku) => {
      const name = (nameBySku?.[sku] ?? "").toLowerCase();
      return sku.toLowerCase().includes(needle) || name.includes(needle);
    });
  }, [q, nameBySku]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const allVisibleSelected =
    visible.length > 0 && visible.every((sku) => selectedSet.has(sku));

  function toggle(sku: string) {
    if (selectedSet.has(sku)) onChange(selected.filter((s) => s !== sku));
    else onChange([...selected, sku]);
  }

  function toggleVisible() {
    if (allVisibleSelected) {
      const hide = new Set(visible);
      onChange(selected.filter((s) => !hide.has(s)));
    } else {
      const next = new Set(selected);
      for (const sku of visible) next.add(sku);
      onChange(FACTORY_CLAIM_SKUS.filter((s) => next.has(s)));
    }
  }

  const label =
    selected.length === 0
      ? "SKU: ไม่เลือก"
      : selected.length === FACTORY_CLAIM_SKUS.length
        ? `SKU: ทั้งหมด (${FACTORY_CLAIM_SKUS.length})`
        : `SKU: ${selected.length} รายการ`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-8 min-w-[180px] rounded-md border border-slate-300 bg-white px-3 text-left text-sm text-slate-800"
      >
        {label}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-80 rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหา SKU หรือชื่อสินค้า..."
              className="h-8 w-full rounded-md border border-slate-300 px-2 text-sm"
            />
          </div>
          <div className="flex items-center justify-between border-b border-slate-100 px-2 py-1.5 text-xs">
            <label className="flex cursor-pointer items-center gap-2 text-slate-700">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleVisible}
              />
              เลือกทั้งหมดที่เห็น
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-slate-500 hover:text-slate-800"
                onClick={() => onChange([...FACTORY_CLAIM_SKUS])}
              >
                เลือกทั้งหมด
              </button>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-800"
                onClick={() => onChange([])}
              >
                ล้าง
              </button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {visible.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-slate-400">ไม่พบ SKU</p>
            ) : (
              visible.map((sku) => {
                const name = nameBySku?.[sku];
                return (
                  <label
                    key={sku}
                    className="flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={selectedSet.has(sku)}
                      onChange={() => toggle(sku)}
                    />
                    <span>
                      <span className="font-mono text-xs">{sku}</span>
                      {name && name !== sku ? (
                        <span className="block text-xs text-slate-500">{name}</span>
                      ) : null}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
