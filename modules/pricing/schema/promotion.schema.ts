import { z } from "zod";
import { idString } from "@/shared/validation/id";
import { nonNegativeDecimalString, positiveDecimalString } from "@/shared/validation/decimal";

export const quoteSchema = z.object({
  warehouseId: idString,
  customerId: idString.optional(),
  customerGroupId: idString.optional(),
  couponCode: z.string().min(1).max(50).optional(),
  lines: z
    .array(
      z.object({
        productId: idString,
        categoryId: idString.optional(),
        quantity: positiveDecimalString,
        unitPrice: nonNegativeDecimalString,
      }),
    )
    .min(1, "at least one line is required"),
});
export type QuoteRequestInput = z.infer<typeof quoteSchema>;
