"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export interface FilterBarProps {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (v: string) => void;
  typeOptions: { value: string; label: string }[];
  typeValue: string;
  onTypeChange: (v: string) => void;
  periodOptions?: { value: string; label: string }[];
  periodValue?: string;
  onPeriodChange?: (v: string) => void;
  riskOptions?: { value: string; label: string }[];
  riskValue?: string;
  onRiskChange?: (v: string) => void;
  skuOptions?: string[];
  skuValue?: string;
  onSkuChange?: (v: string) => void;
  fromValue?: string;
  toValue?: string;
  onFromChange?: (v: string) => void;
  onToChange?: (v: string) => void;
  warrantyFromValue?: string;
  warrantyToValue?: string;
  onWarrantyFromChange?: (v: string) => void;
  onWarrantyToChange?: (v: string) => void;
  onReset?: () => void;
  showSearch?: boolean;
  showType?: boolean;
  showPeriod?: boolean;
  showRisk?: boolean;
  showSku?: boolean;
  showDateRange?: boolean;
  showWarrantyRange?: boolean;
}

export function FilterBar({
  searchPlaceholder = "ค้นหา...",
  searchValue,
  onSearchChange,
  typeOptions,
  typeValue,
  onTypeChange,
  periodOptions = [],
  periodValue = "all",
  onPeriodChange,
  riskOptions = [],
  riskValue = "all",
  onRiskChange,
  skuOptions = [],
  skuValue = "",
  onSkuChange,
  fromValue,
  toValue,
  onFromChange,
  onToChange,
  warrantyFromValue,
  warrantyToValue,
  onWarrantyFromChange,
  onWarrantyToChange,
  onReset,
  showSearch = true,
  showType = true,
  showPeriod = false,
  showRisk = false,
  showSku = false,
  showDateRange = false,
  showWarrantyRange = false,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
      {showSearch && (
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            ค้นหา
          </label>
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#1565C0] focus:outline-none focus:ring-1 focus:ring-[#1565C0]"
          />
        </div>
      )}
      {showType && (
        <div className="min-w-[120px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            ประเภทงาน
          </label>
          <select
            value={typeValue}
            onChange={(e) => onTypeChange(e.target.value)}
            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1565C0] focus:outline-none"
          >
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {showPeriod && periodOptions.length > 0 && onPeriodChange && (
        <div className="min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            ช่วงเวลา
          </label>
          <select
            value={periodValue}
            onChange={(e) => onPeriodChange(e.target.value)}
            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1565C0] focus:outline-none"
          >
            {periodOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {showRisk && riskOptions.length > 0 && onRiskChange && (
        <div className="min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            ระดับความเสี่ยง
          </label>
          <select
            value={riskValue}
            onChange={(e) => onRiskChange(e.target.value)}
            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1565C0] focus:outline-none"
          >
            {riskOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {showSku && skuOptions.length > 0 && onSkuChange && (
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            รุ่น / SKU
          </label>
          <select
            value={skuValue}
            onChange={(e) => onSkuChange(e.target.value)}
            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1565C0] focus:outline-none"
          >
            <option value="">ทั้งหมด</option>
            {skuOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}
      {showDateRange && onFromChange && onToChange && (
        <>
          <div className="min-w-[130px]">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              จากวันที่
            </label>
            <input
              type="date"
              value={fromValue ?? ""}
              onChange={(e) => onFromChange(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#1565C0] focus:outline-none"
            />
          </div>
          <div className="min-w-[130px]">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              ถึงวันที่
            </label>
            <input
              type="date"
              value={toValue ?? ""}
              onChange={(e) => onToChange(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#1565C0] focus:outline-none"
            />
          </div>
        </>
      )}
      {showWarrantyRange && onWarrantyFromChange && onWarrantyToChange && (
        <>
          <div className="min-w-[150px]">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              วันเริ่มประกัน (ตั้งแต่)
            </label>
            <input
              type="date"
              value={warrantyFromValue ?? ""}
              onChange={(e) => onWarrantyFromChange(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#1565C0] focus:outline-none"
            />
          </div>
          <div className="min-w-[150px]">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              วันเริ่มประกัน (ถึง)
            </label>
            <input
              type="date"
              value={warrantyToValue ?? ""}
              onChange={(e) => onWarrantyToChange(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#1565C0] focus:outline-none"
            />
          </div>
        </>
      )}
      {onReset && (
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          ล้างตัวกรอง
        </Button>
      )}
    </div>
  );
}
