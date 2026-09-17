// The `schema` column's shape — an external contract with the Android POS
// app (see Docs/pos_receipt_format_guide.md), not modeled field-by-field:
// each section only has to carry a `type`, everything else is
// type-specific and forward-compatible (an unknown type must be skipped by
// the renderer, never crash it).
export type ReceiptFormatSchemaJson = {
  sections: Array<{ type: string } & Record<string, unknown>>;
};

export type ReceiptFormatAssignmentScope = "TENANT" | "WAREHOUSE" | "TERMINAL";

export type ReceiptFormatAssignmentSummary = {
  scope: ReceiptFormatAssignmentScope;
  tenantId: string | null;
  warehouseId: string | null;
  terminalId: string | null;
};

export type ReceiptFormatView = {
  id: string;
  name: string;
  paperWidth: number;
  schema: ReceiptFormatSchemaJson;
  version: number;
  isDefault: boolean;
  assignments: ReceiptFormatAssignmentSummary[];
  createdAt: string;
  updatedAt: string;
};

// What GET /pos/{posId}/receipt-format returns (wrapped in the usual
// {success,data,message} envelope — see Docs/pos_receipt_format_guide.md's
// "Backend <-> app contract" section for why that's kept even though the
// original Android spec's own examples show flat JSON). formatId stays a
// string, same as every other id in this API (see Docs/MOBILE_API_GUIDE.md),
// again a deliberate deviation from the spec's bare-number example.
export type ResolvedReceiptFormatView = {
  formatId: string;
  name: string;
  version: number;
  paperWidth: number;
  schema: ReceiptFormatSchemaJson;
};

// GET /pos/{posId}/receipt-format/version — trimmed to exactly what the
// spec's lightweight version-check endpoint returns, nothing else.
export type ResolvedReceiptFormatVersionView = {
  version: number;
};
