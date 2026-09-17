import { z } from "zod";
import { idString } from "@/shared/validation/id";

// Deliberately loose: only the envelope (`sections` array, each item at
// least has a `type` string) is validated. `.passthrough()` lets a section
// carry any type-specific fields, and lets a brand-new section type be
// authored via the API before the backend even knows its shape — same
// forward-compatibility philosophy the Android renderer itself follows
// (unknown type -> skip, never crash). See Docs/pos_receipt_format_guide.md.
const receiptFormatSectionSchema = z.object({ type: z.string().min(1) }).passthrough();

export const receiptFormatSchemaJsonSchema = z.object({
  sections: z.array(receiptFormatSectionSchema).min(1),
});

export const createReceiptFormatSchema = z.object({
  name: z.string().min(1).max(150),
  paperWidth: z.coerce.number().int().positive().default(58),
  schema: receiptFormatSchemaJsonSchema,
  isDefault: z.boolean().optional().default(false),
});

// Same shape as create — editing a format is a full replace, not a patch,
// same reasoning as plan.schema.ts's updatePlanSchema.
export const updateReceiptFormatSchema = createReceiptFormatSchema;

export const cloneReceiptFormatSchema = z.object({
  name: z.string().min(1).max(150),
});

export const assignReceiptFormatSchema = z
  .object({
    tenantId: idString.optional(),
    warehouseId: idString.optional(),
    terminalId: idString.optional(),
  })
  .refine((data) => [data.tenantId, data.warehouseId, data.terminalId].filter(Boolean).length === 1, {
    message: "Exactly one of tenantId, warehouseId, or terminalId is required",
  });

export type CreateReceiptFormatInput = z.infer<typeof createReceiptFormatSchema>;
export type UpdateReceiptFormatInput = z.infer<typeof updateReceiptFormatSchema>;
export type CloneReceiptFormatInput = z.infer<typeof cloneReceiptFormatSchema>;
export type AssignReceiptFormatInput = z.infer<typeof assignReceiptFormatSchema>;
