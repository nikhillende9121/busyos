import { z } from "zod";
import { idString, optionalIdString } from "@/shared/validation/id";
import { nonNegativeDecimalString, optionalNonNegativeDecimalString } from "@/shared/validation/decimal";

const optionalPositiveInt = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? undefined : Number(val)),
  z.number({ invalid_type_error: "Must be a valid number" }).int("Must be a whole number").positive("Must be greater than 0").optional(),
);

const optionalDate = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? undefined : val),
  z.coerce.date({ invalid_type_error: "Invalid date" }).optional(),
);

export const createCouponSchema = z.object({
  code: z.string().min(1, "Code is required").max(50, "Code is too long"),
  type: z.enum(["PERCENTAGE", "FLAT", "FREE_SHIPPING"]),
  value: nonNegativeDecimalString,
  scope: z.enum(["ORDER", "PRODUCT", "CATEGORY"]).optional().default("ORDER"),
  warehouseId: optionalIdString,
  customerGroupId: optionalIdString,
  customerId: optionalIdString,
  productIds: z.array(idString).optional(),
  categoryIds: z.array(idString).optional(),
  minPurchaseAmount: optionalNonNegativeDecimalString,
  maxDiscountAmount: optionalNonNegativeDecimalString,
  usageLimitTotal: optionalPositiveInt,
  usageLimitPerCustomer: optionalPositiveInt,
  startDate: z.coerce.date({ invalid_type_error: "Start date is required" }),
  endDate: optionalDate,
  stackable: z.boolean().optional(),
});

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
