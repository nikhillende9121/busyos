"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ExportButtonProps = {
  // API path, without the /api/proxy/v1 prefix or the /export suffix —
  // e.g. "sales" for GET /api/v1/sales/export.
  resource: string;
  // Same filter params the list query uses (dateFrom/dateTo, etc.) — the
  // export endpoint applies them to the full result set, ignoring
  // page/pageSize (see Docs/API_STANDARDS.md and the resource's own
  // exportList controller handler).
  params?: Record<string, string | undefined>;
  disabled?: boolean;
};

// Bypasses lib/api/client.ts's apiClient deliberately — apiClient.request()
// always calls response.json(), but this endpoint returns a real text/csv
// file (see shared/utils/api-response.ts's csvResponse). Still goes through
// /api/proxy/v1/** for the same cookie->bearer auth translation as every
// other dashboard call — the proxy already forwards arbitrary
// Content-Types untouched (app/api/proxy/v1/[...path]/route.ts).
export function ExportButton({ resource, params, disabled }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(params ?? {})) {
        if (value !== undefined && value !== "") {
          search.set(key, value);
        }
      }
      const qs = search.toString();
      const response = await fetch(`/api/proxy/v1/${resource}/export${qs ? `?${qs}` : ""}`);

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        toast.error(body?.error?.message ?? "Export failed. Please try again.");
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? `${resource}-export.csv`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button type="button" variant="outline" onClick={handleExport} disabled={disabled || isExporting}>
      <Download className="size-4" />
      {isExporting ? "Exporting…" : "Export CSV"}
    </Button>
  );
}
