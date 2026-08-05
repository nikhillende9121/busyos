import { z } from "zod";
import { idString } from "@/shared/validation/id";
import { nonNegativeDecimalString, positiveDecimalString } from "@/shared/validation/decimal";

export const createPriceListSchema = z.object({
  name: z.string().min(1).max(150),
  warehouseId: idString.optional(),
  customerGroupId: idString.optional(),
  customerId: idString.optional(),
  currency: z.string().length(3).optional(),
  isDefault: z.boolean().optional(),
  items: z
    .array(
      z.object({
        productId: idString,
        price: nonNegativeDecimalString,
        minQuantity: positiveDecimalString.optional(),
      }),
    )
    .min(1, "at least one item is required"),
});
export type CreatePriceListInput = z.infer<typeof createPriceListSchema>;

export const resolvePriceQuerySchema = z.object({
  productId: idString,
  warehouseId: idString.optional(),
  customerGroupId: idString.optional(),
  customerId: idString.optional(),
  quantity: positiveDecimalString.default("1"),
});
export type ResolvePriceQuery = z.infer<typeof resolvePriceQuerySchema>;
