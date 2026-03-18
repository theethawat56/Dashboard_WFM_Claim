"use client";

import { Button } from "@/components/ui/button";

const API_BASE = "/api/export";

export function ExportButtons({
  sku,
  skus,
  disabled,
}: {
  sku?: string;
  skus?: string[];
  disabled?: boolean;
}) {
  const handleExport = (type: "csv" | "excel" | "pdf" | "txt") => {
    if (type === "excel") {
      const list = skus?.length ? skus : (sku ? [sku] : []);
      const url = list.length
        ? `${API_BASE}/excel?skus=${encodeURIComponent(list.join(","))}`
        : `${API_BASE}/excel`;
      window.open(url, "_blank");
      return;
    }
    if (sku) {
      const url = `${API_BASE}/${type}?sku=${encodeURIComponent(sku)}`;
      window.open(url, "_blank");
      return;
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => handleExport("csv")}
      >
        Export CSV
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => handleExport("excel")}
      >
        Export Excel
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => handleExport("txt")}
      >
        Export TXT
      </Button>
    </div>
  );
}
