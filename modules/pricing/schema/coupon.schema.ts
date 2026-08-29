import { z } from "zod";
import { idString, optionalIdString } from "@/shared/validation/id";
import { nonNegativeDecimalString, optionalNonNegativeDecimalString } from "@/shared/validation/decimal";
import { paginationQueryFields, dateRangeQueryFields } from "@/shared/validation/list-query";

const optionalPositiveInt = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? undefined : Number(val)),
  z.number().int("Must be a whole number").positive("Must be greater than 0").optional(),
);

const optionalDate = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? undefined : val),
  z.coerce.date().optional(),
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
  startDate: z.coerce.date(),
  endDate: optionalDate,
  stackable: z.boolean().optional(),
});

export type CreateCouponInput = z.infer<typeof createCouponSchema>;

// dateFrom/dateTo filter on createdAt — not startDate/endDate, which are
// the coupon's own validity window (business data), not a list filter.
export const listCouponsQuerySchema = z.object({
  ...paginationQueryFields,
  ...dateRangeQueryFields,
});
export type ListCouponsQuery = z.infer<typeof listCouponsQuerySchema>;

// Same filters as the list, minus pagination — see Docs/API_STANDARDS.md -> List Export.
export const exportCouponsQuerySchema = z.object({
  ...dateRangeQueryFields,
});
export type ExportCouponsQuery = z.infer<typeof exportCouponsQuerySchema>;
