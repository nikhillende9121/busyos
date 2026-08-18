import { z } from "zod";
import { idString, optionalIdString } from "@/shared/validation/id";
import { nonNegativeDecimalString, optionalNonNegativeDecimalString } from "@/shared/validation/decimal";

const optionalInt = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? undefined : Number(val)),
  z.number().int("Must be a whole number").optional(),
);

const optionalDate = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? undefined : val),
  z.coerce.date().optional(),
);

export const createDiscountSchema = z.object({
  name: z.string().min(1, "Name is required").max(150, "Name is too long"),
  type: z.enum(["PERCENTAGE", "FLAT"]),
  value: nonNegativeDecimalString,
  scope: z.enum(["ORDER", "PRODUCT", "CATEGORY"]).optional().default("ORDER"),
  warehouseId: optionalIdString,
  customerGroupId: optionalIdString,
  customerId: optionalIdString,
  productIds: z.array(idString).optional(),
  categoryIds: z.array(idString).optional(),
  minPurchaseAmount: optionalNonNegativeDecimalString,
  maxDiscountAmount: optionalNonNegativeDecimalString,
  startDate: z.coerce.date(),
  endDate: optionalDate,
  stackable: z.boolean().optional(),
  priority: optionalInt,
});

export type CreateDiscountInput = z.infer<typeof createDiscountSchema>;
