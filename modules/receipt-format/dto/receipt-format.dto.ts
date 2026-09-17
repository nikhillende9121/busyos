import type { ReceiptFormatSchemaJson } from "../types/receipt-format.types";

export type CreateReceiptFormatDto = {
  name: string;
  paperWidth: number;
  schema: ReceiptFormatSchemaJson;
  isDefault: boolean;
  createdBy: bigint;
};

// Full replace, not partial — see receipt-format.schema.ts's
// updateReceiptFormatSchema.
export type UpdateReceiptFormatDto = {
  formatId: bigint;
  name: string;
  paperWidth: number;
  schema: ReceiptFormatSchemaJson;
  isDefault: boolean;
};

export type CloneReceiptFormatDto = {
  sourceId: bigint;
  name: string;
  createdBy: bigint;
};

// Exactly one of tenantId/warehouseId/terminalId — enforced by
// assignReceiptFormatSchema before this DTO is ever constructed.
export type AssignReceiptFormatDto = {
  formatId: bigint;
  tenantId?: bigint;
  warehouseId?: bigint;
  terminalId?: bigint;
};
