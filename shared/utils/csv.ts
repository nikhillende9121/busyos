export type CsvColumn = { key: string; header: string };

// A cell is quoted (and its own quotes doubled) only when it actually
// contains a comma, quote, or newline — RFC 4180's minimal-quoting rule.
// Keeps a plain CSV readable while staying safe for any value a resource
// might export (names/notes with commas, embedded quotes, etc.).
function escapeCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

// Row order follows `columns`, not object key order — so a resource's CSV
// column order is explicit and stable regardless of how the row object was
// built. \r\n per RFC 4180; most spreadsheet software assumes it.
export function toCsv(rows: Record<string, unknown>[], columns: CsvColumn[]): string {
  const header = columns.map((column) => escapeCell(column.header)).join(",");
  const lines = rows.map((row) => columns.map((column) => escapeCell(row[column.key])).join(","));
  return [header, ...lines].join("\r\n") + "\r\n";
}
