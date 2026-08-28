import { z } from "zod";
import { idString } from "@/shared/validation/id";
import { positiveDecimalString } from "@/shared/validation/decimal";

export const createSaleExchangeSchema = z.object({
  saleId: idString,
  reason: z.string().min(1).max(255),
  returnItems: z
    .array(
      z.object({
        saleItemId: idString,
        quantity: positiveDecimalString,
      }),
    )
    .min(1, "at least one returned item is required"),
  newItems: z
    .array(
      z.object({
        productId: idString,
        quantity: positiveDecimalString,
        // No client-supplied price — resolved server-side the same way as
        // a normal Sale (see modules/sales/schema/sale.schema.ts).
      }),
    )
    .min(1, "at least one replacement item is required"),
  couponCode: z.string().min(1).max(50).optional(),
  extraChargeIds: z.array(idString).optional(),
  paymentMethod: z.enum(["CASH", "CARD", "BANK_TRANSFER", "UPI", "CHEQUE", "CREDIT"]),
});
export type CreateSaleExchangeInput = z.infer<typeof createSaleExchangeSchema>;

// Same shape as create, minus `reason` and `paymentMethod` — a preview
// settles nothing, so there's no payment direction to collect yet.
export const quoteSaleExchangeSchema = z.object({
  saleId: idString,
  returnItems: z
    .array(
      z.object({
        saleItemId: idString,
        quantity: positiveDecimalString,
      }),
    )
    .min(1, "at least one returned item is required"),
  newItems: z
    .array(
      z.object({
        productId: idString,
        quantity: positiveDecimalString,
      }),
    )
    .min(1, "at least one replacement item is required"),
  couponCode: z.string().min(1).max(50).optional(),
  extraChargeIds: z.array(idString).optional(),
});
export type QuoteSaleExchangeInput = z.infer<typeof quoteSaleExchangeSchema>;
