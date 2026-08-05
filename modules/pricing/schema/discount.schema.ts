import { z } from "zod";
import { idString } from "@/shared/validation/id";
import { nonNegativeDecimalString } from "@/shared/validation/decimal";

export const createDiscountSchema = z
  .object({
    name: z.string().min(1).max(150),
    type: z.enum(["PERCENTAGE", "FLAT"]),
    value: nonNegativeDecimalString,
    scope: z.enum(["ORDER", "PRODUCT", "CATEGORY"]),
    warehouseId: idString.optional(),
    customerGroupId: idString.optional(),
    customerId: idString.optional(),
    productIds: z.array(idString).optional(),
    categoryIds: z.array(idString).optional(),
    minPurchaseAmount: nonNegativeDecimalString.optional(),
    maxDiscountAmount: nonNegativeDecimalString.optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    stackable: z.boolean().optional(),
    priority: z.number().int().optional(),
  })
  .refine((data) => data.scope !== "PRODUCT" || (data.productIds && data.productIds.length > 0), {
    message: "productIds is required when scope is PRODUCT",
    path: ["productIds"],
  })
  .refine((data) => data.scope !== "CATEGORY" || (data.categoryIds && data.categoryIds.length > 0), {
    message: "categoryIds is required when scope is CATEGORY",
    path: ["categoryIds"],
  });
export type CreateDiscountInput = z.infer<typeof createDiscountSchema>;
