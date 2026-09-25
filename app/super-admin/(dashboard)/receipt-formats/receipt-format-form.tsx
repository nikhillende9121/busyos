"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useForm, Controller, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoaderButton } from "@/components/ui/loader-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

// A starting point for a Super Admin authoring a new format, not a fixed
// template — the schema textarea below accepts any `{ sections: [...] }`
// shape (see modules/receipt-format/schema/receipt-format.schema.ts's
// deliberately loose validation). Field names and {{token}} spelling here
// are NOT arbitrary — they must match the Android renderer's dispatcher
// exactly (main content field is always `value`, never `content`; tokens
// are snake_case) — see Docs/pos_receipt_format_guide.md.
export const DEFAULT_SCHEMA = {
  sections: [
    { type: "text", value: "{{store_name}}", align: "center", bold: true, size: "large" },
    { type: "text", value: "{{address}}", align: "center", size: "small" },
    { type: "divider" },
    { type: "keyvalue", key: "Invoice", value: "{{invoice_no}}" },
    { type: "keyvalue", key: "Date", value: "{{date}} {{time}}" },
    { type: "keyvalue", key: "Cashier", value: "{{cashier}}" },
    { type: "divider" },
    {
      type: "items",
      columns: ["name", "qty", "price", "total"],
      headers: { name: "Item", qty: "Qty", price: "Price", total: "Total" },
      totals: [
        { label: "Subtotal", value: "{{subtotal}}" },
        { label: "Discount", value: "{{discount}}" },
        { label: "Tax", value: "{{tax}}" },
        { label: "TOTAL", value: "{{total}}", bold: true },
      ],
    },
    { type: "spacer", lines: 1 },
    { type: "qr", value: "{{invoice_no}}" },
    { type: "spacer", lines: 1 },
    { type: "terms", value: "All sales are final.\nGoods once sold will not be exchanged or refunded." },
    { type: "text", value: "Thank you!", align: "center" },
  ],
};

const SECTION_TYPE_REFERENCE: { type: string; description: string }[] = [
  { type: "text", description: "value (text, may use {{tokens}}), align (left/center/right), bold (true/false), size (xs/small/normal/large)." },
  { type: "keyvalue", description: "key (label text), value (text, may use {{tokens}}), bold (true/false) — left key, right value on one line." },
  { type: "divider", description: "No properties — a full-width separator line." },
  {
    type: "items",
    description:
      'columns (array, any subset/order of "name"/"qty"/"price"/"total" — plus any custom key, previewable but blank on-device until the app supports it). headers (object, column key → custom label). totals (array of { label, value, bold? }, e.g. Subtotal/Tax/Total rows merged into the same table as a footer — portal-only preview, see the warning below). bordered (true/false, default true) — set false for a plain list with no grid lines, closer to a compact thermal receipt; this one\'s purely a preview choice either way, a real printer never draws box borders.',
  },
  { type: "image", description: "value (an image URL), align (left/center/right) — a logo." },
  { type: "barcode", description: "value (text, may use {{tokens}}) — symbology defaults to code128 on the app side." },
  { type: "qr", description: "value (text, may use {{tokens}})." },
  { type: "spacer", description: "lines (integer) — blank vertical space, that many lines tall." },
  {
    type: "terms",
    description:
      "value (text, use \\n for multiple lines, may use {{tokens}}), align, size (defaults to xs) — a small-print terms & conditions block.",
  },
  {
    type: "row",
    description:
      "sections (array of section objects, any type — even another row) — lays them out side by side on one line instead of stacked, each getting an equal share of the width unless it sets its own width (a number, relative weight). Portal-only preview, see the warning below.",
  },
];

// "xs" and "terms" are portal-only additions on top of the Android guide's
// own section-type list (text/keyvalue/divider/items/image/barcode/qr/
// spacer) and its three-bucket size enum (small/normal/large) — see
// Docs/pos_receipt_format_guide.md. Both preview correctly here, but an
// unknown type/size is exactly what the Android renderer is designed to
// tolerate (skip silently / fall back to a default), so a "terms" section
// simply won't print anything until the Android side adds a matching
// case — flag it to that team before relying on it for something that
// must actually appear on the printed receipt.
//
// Same caveat applies to `items.totals`: the Android guide's own `items`
// section has no footer concept at all — it's a table of line items and
// nothing else. Merging Subtotal/Tax/Total into that same table (instead
// of separate `keyvalue` sections after it, which DO work today) is a
// portal-preview-only convenience until the app's items renderer grows a
// matching footer case.
//
// Same again for `row`: the Android guide's dispatcher is a single
// top-to-bottom loop over `sections` (see Section 6.2's `renderReceipt`)
// with no concept of laying two sections out side by side — so a `row`
// previews here, but every one of its child sections is simply skipped
// on a real device today (an unrecognized `type`, same as any other),
// not rendered stacked as a fallback.

// The exact token vocabulary the Android app's on-device data map uses
// (Docs/pos_receipt_format_guide.md section 3.2) — snake_case, and fixed.
// A schema authored with any other token (e.g. "{{storeName}}") silently
// renders blank on the device, since an unresolved token is replaced with
// "" rather than left visible or erroring.
const ALLOWED_PLACEHOLDERS = [
  "store_name",
  "address",
  "invoice_no",
  "date",
  "time",
  "cashier",
  "subtotal",
  "tax",
  "discount",
  "total",
  "items",
];

// Sample values the live preview substitutes into {{token}} placeholders —
// there's no real sale to render against while authoring, so this stands
// in for it. Not an exhaustive token list, just enough to make a template
// look like a receipt; an unknown token is left as "{{token}}" rather than
// blanked out, so the author can still see it needs wiring up.
// date/time are fixed strings, not `new Date()` — computing "now" here
// would run once at SSR time and again at client hydration time, each
// getting a different second, which is a real hydration mismatch (React
// diffs the server-rendered markup against the client's first render).
const SAMPLE_DATA: Record<string, string> = {
  store_name: "RetailX Demo Store",
  address: "123 MG Road, Pune, MH",
  invoice_no: "INV-2026-00231",
  date: "17/09/2026",
  time: "4:37 PM",
  cashier: "Aisha",
  subtotal: "1,150.00",
  tax: "98.00",
  discount: "0.00",
  total: "1,248.00",
};

const SAMPLE_ITEMS: Record<string, string>[] = [
  { name: "Blue T-Shirt (M)", qty: "2", price: "250.00", total: "500.00" },
  { name: "Denim Jeans", qty: "1", price: "650.00", total: "650.00" },
];
// The only columns the Android app's on-device line-item data actually
// has values for (see Docs/pos_receipt_format_guide.md) — anything else
// is a "custom" column: previewable here, but blank on a real device
// until that app's item data model grows to include it.
const ITEM_COLUMNS = ["name", "qty", "price", "total"] as const;
const ITEM_COLUMN_LABELS: Record<string, string> = { name: "Item", qty: "Qty", price: "Price", total: "Total" };

function titleCaseColumn(key: string): string {
  return key
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function substituteTokens(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => SAMPLE_DATA[key] ?? `{{${key}}}`);
}

type PreviewSection = { type: string } & Record<string, unknown>;

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// 96 CSS px per inch / 2.54cm per inch — the standard CSS-px<->physical-unit
// conversion, so the preview renders at true physical scale (a 210mm
// "landscape invoice" format actually looks wide, not squeezed into a
// narrow thermal-receipt-shaped box) and the ruler's cm marks line up with
// a ruler held up to the screen.
const PX_PER_CM = 96 / 2.54;
const RULER_SIZE = 18;

function useMeasuredHeight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, height] as const;
}

// A cm ruler along one edge of the preview — a tick every cm, a labeled,
// taller tick every 5cm — so the author can see the receipt's actual
// printed size, not just a scaled-to-fit approximation.
function RulerTicks({ lengthPx, orientation }: { lengthPx: number; orientation: "horizontal" | "vertical" }) {
  const count = Math.max(1, Math.ceil(lengthPx / PX_PER_CM));
  const isHorizontal = orientation === "horizontal";
  return (
    <div
      className="relative shrink-0 text-[8px] text-muted-foreground"
      style={isHorizontal ? { width: lengthPx, height: RULER_SIZE } : { height: lengthPx, width: RULER_SIZE }}
    >
      {Array.from({ length: count + 1 }).map((_, i) => {
        const major = i % 5 === 0;
        return (
          <div
            key={i}
            className={cn(
              "absolute border-muted-foreground/50",
              isHorizontal ? "top-0 border-l" : "left-0 border-t",
            )}
            style={
              isHorizontal
                ? { left: i * PX_PER_CM, height: major ? 10 : 6 }
                : { top: i * PX_PER_CM, width: major ? 10 : 6 }
            }
          >
            {major && (
              <span className={isHorizontal ? "absolute top-2.5 left-0.5" : "absolute top-0.5 left-2.5"}>{i}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Renders `schema.sections` as it would look on a receipt — same section
// types and same "unknown type -> skip on the device" tolerance the
// Android renderer follows (see Docs/pos_receipt_format_guide.md), except
// here an unknown type is called out visually instead of silently
// dropped, since this view is for the author, not the customer holding
// the receipt. Rendered at true physical scale (see PX_PER_CM) with a cm
// ruler on both edges, in a horizontally-scrollable frame — a wide/
// landscape format (e.g. a 210mm sheet, not just a 58/80mm thermal roll)
// renders at its real width instead of being squeezed to fit.
function ReceiptPreview({ schemaText, paperWidth }: { schemaText: string; paperWidth: number }) {
  let sections: PreviewSection[] | null = null;
  let parseError: string | null = null;
  try {
    const parsed = JSON.parse(schemaText);
    if (!Array.isArray(parsed?.sections)) throw new Error('Missing a "sections" array');
    sections = parsed.sections;
  } catch (error) {
    parseError = error instanceof Error ? error.message : "Invalid JSON";
  }

  const [contentRef, contentHeight] = useMeasuredHeight<HTMLDivElement>();
  const widthMm = paperWidth || 58;
  const widthCm = widthMm / 10;
  const widthPx = widthCm * PX_PER_CM;
  const PX_PER_MM = PX_PER_CM / 10;

  // A4 usable width after a 10mm margin on each side is ~190mm — anything
  // wider (e.g. a 210mm "landscape sheet" format) needs the page itself
  // rotated to landscape or it'll clip when printed.
  const MARGIN_MM = 10;
  const pageOrientation = widthMm > 190 ? "landscape" : "portrait";
  const pageWidthMm = pageOrientation === "landscape" ? 297 : 210;
  const pageHeightMm = pageOrientation === "landscape" ? 210 : 297;
  const usableWidthMm = pageWidthMm - MARGIN_MM * 2;
  const usableHeightMm = pageHeightMm - MARGIN_MM * 2;

  // contentHeight is measured off the on-screen preview block, which is
  // rendered at this same true physical width and the same font-size px
  // values — so its natural (pre-scale) height is a reliable stand-in for
  // the print block's own height without needing it visible to measure.
  // Scaling down (never up) is how a receipt with lots of items/terms
  // still lands on exactly one A4 page instead of spilling onto a 2nd,
  // 3rd... — the outer box below is hard-clamped to one page's usable
  // area regardless, as a backstop against this estimate being slightly
  // off.
  const contentHeightMm = contentHeight / PX_PER_MM;
  const printScale =
    contentHeightMm > 0
      ? Math.min(1, usableWidthMm / widthMm, usableHeightMm / contentHeightMm)
      : Math.min(1, usableWidthMm / widthMm);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-muted-foreground">
          Live preview (sample data) — actual size, ruler in cm ({widthCm.toFixed(1)}cm wide)
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={Boolean(parseError) || !sections || sections.length === 0}
          onClick={() => window.print()}
        >
          <Download className="size-3.5" /> Download PDF
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border bg-muted/30 p-4">
        {parseError ? (
          <p className="text-xs text-destructive">Fix the JSON to see a preview — {parseError}</p>
        ) : (
          <div className="inline-block">
            <div className="flex">
              <div style={{ width: RULER_SIZE, height: RULER_SIZE }} />
              <RulerTicks lengthPx={widthPx} orientation="horizontal" />
            </div>
            <div className="flex">
              <RulerTicks lengthPx={contentHeight} orientation="vertical" />
              <div
                ref={contentRef}
                className="space-y-1 bg-white p-3 font-mono text-[10px] leading-snug text-black shadow-sm"
                style={{ width: widthPx }}
              >
                {sections && sections.length > 0 ? (
                  sections.map((section, i) => <ReceiptSectionPreview key={i} section={section} />)
                ) : (
                  <p className="text-center text-muted-foreground">No sections yet</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* "Download PDF" is really "print" — window.print() with a browser's
          "Save as PDF" destination. This avoids a canvas-rasterization
          library (html2canvas/jspdf) whose px->physical-unit scaling is
          only an approximation; browsers already map CSS mm exactly to
          physical size on both real printers and PDF output, which is the
          whole point of "actual size, so I can print and check". Only this
          hidden node is shown when printing — see the @media print rules
          below, which hide everything else on the page. */}
      {!parseError && sections && sections.length > 0 && (
        <div id="receipt-print-area" className="hidden">
          <style>{`
            @media print {
              @page { size: A4 ${pageOrientation}; margin: ${MARGIN_MM}mm; }
              body * { visibility: hidden; }
              #receipt-print-area, #receipt-print-area * { visibility: visible !important; }
              #receipt-print-area {
                display: block !important;
                position: absolute;
                top: 0;
                left: 0;
              }
            }
          `}</style>
          {/* Hard-clamped to exactly one page's usable area (overflow
              hidden) — the scale transform on the child is the primary
              fit mechanism, this box is the backstop that guarantees a
              5-page receipt still can't spill onto page 2. */}
          <div style={{ width: `${usableWidthMm}mm`, height: `${usableHeightMm}mm`, overflow: "hidden" }}>
            <div
              className="space-y-1 bg-white p-3 font-mono text-[10px] leading-snug text-black"
              style={{ width: `${widthMm}mm`, transform: `scale(${printScale})`, transformOrigin: "top left" }}
            >
              {sections.map((section, i) => (
                <ReceiptSectionPreview key={i} section={section} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function alignOf(value: unknown, fallback: "left" | "center" | "right"): "left" | "center" | "right" {
  return (["left", "center", "right"] as const).includes(value as never) ? (value as never) : fallback;
}

function sizeClassOf(size: unknown, fallback: string): string {
  return size === "large"
    ? "text-[13px]"
    : size === "small"
      ? "text-[9px]"
      : size === "xs"
        ? "text-[7px]"
        : size === "normal"
          ? "text-[10px]"
          : fallback;
}

function ReceiptSectionPreview({ section }: { section: PreviewSection }) {
  switch (section.type) {
    case "text": {
      const align = alignOf(section.align, "left");
      const sizeClass = sizeClassOf(section.size, "text-[10px]");
      return (
        <p className={cn(sizeClass, Boolean(section.bold) && "font-bold")} style={{ textAlign: align }}>
          {substituteTokens(asText(section.value))}
        </p>
      );
    }
    case "keyvalue":
      return (
        <div className={cn("flex justify-between gap-2", Boolean(section.bold) && "font-bold")}>
          <span>{asText(section.key)}</span>
          <span>{substituteTokens(asText(section.value))}</span>
        </div>
      );
    case "divider":
      return <div className="my-1 border-t border-dashed border-black/50" />;
    case "items": {
      // Any string key is accepted, not just the 4 known ones — see the
      // "custom column" warning this renders below the table. Filtering
      // to just ITEM_COLUMNS here would silently drop a column the author
      // deliberately typed, which is worse than showing it with a visible
      // placeholder-data caveat.
      const columns = Array.isArray(section.columns)
        ? section.columns.filter((c): c is string => typeof c === "string")
        : ["name", "qty", "total"];
      // Per-column header override — { "name": "Product" } replaces just
      // that column's label, everything else keeps ITEM_COLUMN_LABELS'
      // default (or a title-cased version of the key itself for a custom
      // column). This is the "control each column" knob: which columns
      // show (`columns`), in what order (`columns`' order), and what each
      // one is labeled (`headers`).
      const headerOverrides =
        section.headers && typeof section.headers === "object" && !Array.isArray(section.headers)
          ? (section.headers as Record<string, unknown>)
          : {};
      const rightAligned = new Set(["qty", "price", "total"]);
      const customColumns = columns.filter((c) => !(ITEM_COLUMNS as readonly string[]).includes(c));
      const totalsRows = Array.isArray(section.totals)
        ? section.totals.filter(
            (t): t is { label?: unknown; value?: unknown; bold?: unknown } => typeof t === "object" && t !== null,
          )
        : [];
      const labelSpan = Math.max(1, columns.length - 1);
      // Grid lines are a portal-only visual choice, not part of the device
      // contract either way — a real thermal printer doesn't draw box
      // borders, it just prints plain text columns, so this never needed
      // the "won't print on a real device" caveat the other items fields
      // get. Defaults to bordered (the more legible option while
      // authoring); set `"bordered": false` for a plain-text look closer
      // to a compact thermal receipt.
      const bordered = section.bordered !== false;
      const cellBorder = bordered ? "border border-black/70" : "";
      return (
        <div className="space-y-1">
          <table className={cn("w-full border-collapse", bordered && "border border-black/70")}>
            <thead>
              <tr className={bordered ? "bg-black/10" : "border-b border-black/70"}>
                {columns.map((col) => {
                  const override = headerOverrides[col];
                  const label =
                    typeof override === "string" ? override : (ITEM_COLUMN_LABELS[col] ?? titleCaseColumn(col));
                  return (
                    <th
                      key={col}
                      className={cn(
                        cellBorder,
                        "px-1 py-0.5 font-bold",
                        rightAligned.has(col) ? "text-right" : "text-left",
                      )}
                    >
                      {label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {SAMPLE_ITEMS.map((item, i) => (
                <tr key={i}>
                  {columns.map((col) => {
                    const isCustom = !(col in item);
                    return (
                      <td
                        key={col}
                        className={cn(
                          cellBorder,
                          "px-1 py-0.5",
                          rightAligned.has(col) ? "text-right" : "text-left",
                          isCustom && "italic text-muted-foreground",
                        )}
                      >
                        {isCustom ? "— sample —" : item[col]}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {totalsRows.length > 0 && (
              <tfoot>
                {totalsRows.map((row, i) => (
                  <tr key={i} className={cn(Boolean(row.bold) && "font-bold")}>
                    <td colSpan={labelSpan} className={cn(cellBorder, "px-1 py-0.5 text-right")}>
                      {asText(row.label)}
                    </td>
                    <td className={cn(cellBorder, "px-1 py-0.5 text-right")}>
                      {substituteTokens(asText(row.value))}
                    </td>
                  </tr>
                ))}
              </tfoot>
            )}
          </table>
          {customColumns.length > 0 && (
            <p className="text-[8px] text-amber-700">
              &quot;{customColumns.join(", ")}&quot; {customColumns.length === 1 ? "isn't" : "aren't"} one of the
              Android app&apos;s known item fields (name/qty/price/total) — shown here as placeholder data only;
              it renders blank on a real device until that app&apos;s line-item data is extended to include it.
            </p>
          )}
          {totalsRows.length > 0 && (
            <p className="text-[8px] text-amber-700">
              This footer is a portal-only preview — the Android app&apos;s items table has no footer concept yet,
              so these rows won&apos;t print until it does. For a working receipt today, use separate{" "}
              <code className="rounded bg-muted px-0.5">keyvalue</code> sections after this table instead.
            </p>
          )}
        </div>
      );
    }
    case "image": {
      const align = alignOf(section.align, "center");
      const url = asText(section.value);
      return (
        <div style={{ textAlign: align }}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- author-supplied preview URL, not a local/static asset
            <img src={url} alt="" className="inline-block max-h-10" />
          ) : (
            <div className="flex h-10 items-center justify-center border border-dashed text-[9px] text-muted-foreground">
              IMAGE (no value set)
            </div>
          )}
        </div>
      );
    }
    case "barcode":
      return (
        <div className="flex flex-col items-center gap-0.5 py-1">
          <div className="flex h-6 items-end gap-[1px]">
            {Array.from({ length: 24 }).map((_, i) => (
              <span key={i} style={{ width: 2, height: i % 3 === 0 ? "100%" : "60%" }} className="bg-black" />
            ))}
          </div>
          <span className="text-[8px]">{substituteTokens(asText(section.value))}</span>
        </div>
      );
    case "qr":
      return (
        <div className="mx-auto flex size-12 items-center justify-center border text-[8px] text-muted-foreground">
          QR
        </div>
      );
    case "spacer": {
      const lines = typeof section.lines === "number" && section.lines > 0 ? section.lines : 1;
      return <div style={{ height: lines * 10 }} />;
    }
    // Portal-only addition, not in the original Android section-type list
    // — see the note above SECTION_TYPE_REFERENCE. Defaults to "xs" (fine
    // print), each "\n" in `value` is its own line.
    case "terms": {
      const align = alignOf(section.align, "left");
      const sizeClass = sizeClassOf(section.size, "text-[7px]");
      const lines = substituteTokens(asText(section.value)).split("\n");
      return (
        <div className={cn(sizeClass, "space-y-0.5 text-muted-foreground")} style={{ textAlign: align }}>
          {lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      );
    }
    // Portal-only addition, not in the original Android section-type list
    // — see the note above SECTION_TYPE_REFERENCE. Each child is just a
    // normal section (rendered by this same function, recursively), laid
    // out with flexbox instead of stacked; `width` on a child is a relative
    // flex weight (default 1 — equal shares).
    case "row": {
      const children = Array.isArray(section.sections)
        ? section.sections.filter(
            (s): s is PreviewSection =>
              typeof s === "object" && s !== null && typeof (s as Record<string, unknown>).type === "string",
          )
        : [];
      if (children.length === 0) {
        return (
          <p className="rounded border border-dashed border-amber-400 bg-amber-50 px-1 py-0.5 text-[9px] text-amber-700">
            Empty row — add a &quot;sections&quot; array.
          </p>
        );
      }
      return (
        <div className="space-y-1">
          <div className="flex gap-2">
            {children.map((child, i) => {
              const weight = typeof child.width === "number" && child.width > 0 ? child.width : 1;
              return (
                <div key={i} className="min-w-0" style={{ flex: weight }}>
                  <ReceiptSectionPreview section={child} />
                </div>
              );
            })}
          </div>
          <p className="text-[8px] text-amber-700">
            This row is a portal-only preview — the Android app has no concept of laying sections side by side, so
            every section inside it is skipped (not stacked) on a real device today.
          </p>
        </div>
      );
    }
    default:
      return (
        <p className="rounded border border-dashed border-amber-400 bg-amber-50 px-1 py-0.5 text-[9px] text-amber-700">
          Unknown type &quot;{section.type}&quot; — the app will skip this section
        </p>
      );
  }
}

export type FormatFormValues = {
  name: string;
  paperWidth: string;
  isDefault: boolean;
  schemaText: string;
};

export function ReceiptFormatForm({
  defaultValues,
  submitLabel,
  onSubmit,
}: {
  defaultValues: FormatFormValues;
  submitLabel: string;
  onSubmit: (values: FormatFormValues) => Promise<void>;
}) {
  const form = useForm<FormatFormValues>({ defaultValues });
  const [showReference, setShowReference] = useState(false);
  const schemaText = useWatch({ control: form.control, name: "schemaText" });
  const paperWidthText = useWatch({ control: form.control, name: "paperWidth" });

  const handleSubmit = async (values: FormatFormValues) => {
    try {
      JSON.parse(values.schemaText);
    } catch {
      form.setError("schemaText", { message: "Not valid JSON" });
      return;
    }
    try {
      await onSubmit(values);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      <Card>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="58mm Standard" {...form.register("name", { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paperWidth">Paper width (mm)</Label>
              <Input id="paperWidth" type="number" min={1} {...form.register("paperWidth", { required: true })} />
              <p className="text-xs text-muted-foreground">
                Not just 58/80mm thermal rolls — a wider value (e.g. 210 for an A4-style landscape sheet) previews
                at its real width below.
              </p>
            </div>
          </div>
          <Controller
            control={form.control}
            name="isDefault"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(Boolean(checked))} />
                Use as the global default (falls back to this when nothing else matches)
              </label>
            )}
          />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="schemaText">Schema (sections JSON)</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2"
                onClick={() => setShowReference((v) => !v)}
              >
                {showReference ? "Hide" : "Show"} section type reference
              </button>
            </div>
            {showReference && (
              <div className="space-y-2 rounded-md border p-2 text-xs">
                {SECTION_TYPE_REFERENCE.map((row) => (
                  <div key={row.type} className="flex gap-2 py-0.5">
                    <span className="w-16 shrink-0 font-mono font-medium">{row.type}</span>
                    <span className="text-muted-foreground">{row.description}</span>
                  </div>
                ))}
                <div className="border-t pt-2">
                  <p className="mb-1 font-medium">
                    Allowed tokens — anything else renders as blank on the device:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {ALLOWED_PLACEHOLDERS.map((token) => (
                      <code key={token} className="rounded bg-muted px-1 py-0.5 font-mono">
                        {`{{${token}}}`}
                      </code>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <Textarea
              id="schemaText"
              rows={16}
              className="font-mono text-xs"
              {...form.register("schemaText", { required: true })}
            />
            {form.formState.errors.schemaText && (
              <p className="text-xs text-destructive">{form.formState.errors.schemaText.message}</p>
            )}
          </div>
          <ReceiptPreview schemaText={schemaText ?? ""} paperWidth={Number(paperWidthText) || 58} />
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" render={<Link href="/super-admin/receipt-formats">Cancel</Link>} />
        <LoaderButton type="submit" loading={form.formState.isSubmitting}>
          {submitLabel}
        </LoaderButton>
      </div>
    </form>
  );
}
