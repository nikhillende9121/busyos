import { z } from "zod";
import { idString, optionalIdString } from "@/shared/validation/id";
import { nonNegativeDecimalString, positiveDecimalString } from "@/shared/validation/decimal";

export const quoteSchema = z.object({
  warehouseId: idString,
  customerId: optionalIdString,
  customerGroupId: optionalIdString,
  couponCode: z.string().min(1).max(50).optional(),
  extraChargeIds: z.array(idString).optional(),
  channel: z.enum(["POS", "ONLINE", "MARKETPLACE", "PHONE"]).optional(),
  taxInclusive: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        productId: idString,
        categoryId: optionalIdString,
        quantity: positiveDecimalString,
        unitPrice: nonNegativeDecimalString,
      }),
    )
    .min(1, "at least one line is required"),
});
export type QuoteRequestInput = z.infer<typeof quoteSchema>;
