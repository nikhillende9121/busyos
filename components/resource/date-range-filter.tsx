"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type DateRange = { dateFrom?: string; dateTo?: string };

type DateRangeFilterProps = {
  value: DateRange;
  onChange: (value: DateRange) => void;
};

// Controlled {dateFrom, dateTo} pair (both plain "YYYY-MM-DD" strings, same
// as a native <input type="date">'s own value) — a list page owns the
// state and passes it straight through as query params, same shape the
// list-query schema's dateRangeQueryFields (shared/validation/list-query.ts)
// expects.
export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  return (
    <div className="flex items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="dateFrom">From</Label>
        <Input
          id="dateFrom"
          type="date"
          value={value.dateFrom ?? ""}
          onChange={(e) => onChange({ ...value, dateFrom: e.target.value || undefined })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dateTo">To</Label>
        <Input
          id="dateTo"
          type="date"
          value={value.dateTo ?? ""}
          onChange={(e) => onChange({ ...value, dateTo: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}
