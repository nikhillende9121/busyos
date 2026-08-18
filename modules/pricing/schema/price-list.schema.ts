import { z } from "zod";
import { idString, optionalIdString } from "@/shared/validation/id";
import { nonNegativeDecimalString, positiveDecimalString } from "@/shared/validation/decimal";

// `.optional()` only ever accepts a literal `undefined` — an empty string
// is still a defined value and fails positiveDecimalString's "at least one
// digit" regex. minQuantity is the one genuinely-optional line-item field
// (a blank input is the normal, expected case, not an error), so "" must
// normalize to undefined before the optional check runs, not after — this
// is the actual API validation boundary (client and server both parse
// through this schema), not just a form-level workaround.
const optionalPositiveDecimalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  positiveDecimalString.optional(),
);

export const createPriceListSchema = z.object({
  name: z.string().min(1, "Name is required").max(150),
  warehouseId: optionalIdString,
  customerGroupId: optionalIdString,
  customerId: optionalIdString,
  currency: z.string().length(3).optional(),
  isDefault: z.boolean().optional(),
  items: z
    .array(
      z.object({
        productId: idString,
        price: nonNegativeDecimalString,
        minQuantity: optionalPositiveDecimalString,
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
