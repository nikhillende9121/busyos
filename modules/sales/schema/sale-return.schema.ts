import { z } from "zod";
import { idString } from "@/shared/validation/id";
import { positiveDecimalString } from "@/shared/validation/decimal";

export const createSaleReturnSchema = z.object({
  saleId: idString,
  reason: z.string().min(1).max(255),
  items: z
    .array(
      z.object({
        saleItemId: idString,
        quantity: positiveDecimalString,
      }),
    )
    .min(1, "at least one item is required"),
});
export type CreateSaleReturnInput = z.infer<typeof createSaleReturnSchema>;

// Same item shape as create, minus `reason` — a preview never persists a
// record, so there's nothing to attach a reason to yet.
export const quoteSaleReturnSchema = z.object({
  saleId: idString,
  items: z
    .array(
      z.object({
        saleItemId: idString,
        quantity: positiveDecimalString,
      }),
    )
    .min(1, "at least one item is required"),
});
export type QuoteSaleReturnInput = z.infer<typeof quoteSaleReturnSchema>;
