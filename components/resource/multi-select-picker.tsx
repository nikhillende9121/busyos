"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A searchable, multi-select dropdown with checkboxes and badge chips.
 * Used for selecting products, categories, customers, etc. in forms where
 * comma-separated IDs would be hostile to the user.
 *
 * Controlled via `value` (string[]) and `onChange` (string[] => void).
 */
export type MultiSelectOption = {
  label: string;
  value: string;
};

type MultiSelectPickerProps = {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  maxDisplay?: number;
};

export function MultiSelectPicker({
  options,
  value,
  onChange,
  placeholder = "Select…",
  emptyMessage = "No results found.",
  maxDisplay = 3,
}: MultiSelectPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(lower));
  }, [options, search]);

  const selectedLabels = useMemo(() => {
    const map = new Map(options.map((o) => [o.value, o.label]));
    return value.map((v) => map.get(v) ?? v);
  }, [options, value]);

  const toggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const remove = (optionValue: string) => {
    onChange(value.filter((v) => v !== optionValue));
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <div
        role="combobox"
        aria-expanded={open}
        tabIndex={0}
        className="flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background cursor-pointer font-normal shadow-sm hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
      >
        <span className="flex flex-1 flex-wrap gap-1 overflow-hidden">
          {value.length === 0 && (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          {selectedLabels.slice(0, maxDisplay).map((label, index) => (
            <Badge key={value[index]} variant="secondary" className="max-w-32 truncate text-xs">
              {label}
              <span
                role="button"
                className="ml-1 rounded-full outline-none hover:text-destructive cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(value[index]);
                }}
                aria-label={`Remove ${label}`}
              >
                <X className="size-3" />
              </span>
            </Badge>
          ))}
          {value.length > maxDisplay && (
            <Badge variant="outline" className="text-xs">
              +{value.length - maxDisplay} more
            </Badge>
          )}
        </span>
        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="p-2">
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <p className="px-2 py-1.5 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </p>
            )}
            {filtered.map((option) => {
              const selected = value.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent",
                    selected && "bg-accent/50",
                  )}
                  onClick={() => toggle(option.value)}
                >
                  <div
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30",
                    )}
                  >
                    {selected && <Check className="size-3" />}
                  </div>
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
          {value.length > 0 && (
            <div className="border-t p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-full text-xs"
                onClick={() => onChange([])}
              >
                Clear all
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
