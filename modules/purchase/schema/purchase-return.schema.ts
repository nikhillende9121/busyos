import { z } from "zod";
import { idString, optionalIdString } from "@/shared/validation/id";
import { positiveDecimalString } from "@/shared/validation/decimal";
import { paginationQueryFields, dateRangeQueryFields } from "@/shared/validation/list-query";

export const createPurchaseReturnSchema = z.object({
  purchaseId: idString,
  reason: z.string().min(1).max(255),
  items: z
    .array(
      z.object({
        purchaseItemId: idString,
        quantity: positiveDecimalString,
      }),
    )
    .min(1, "at least one item is required"),
});
export type CreatePurchaseReturnInput = z.infer<typeof createPurchaseReturnSchema>;

// dateFrom/dateTo filter on createdAt — a purchase return has no date of
// its own beyond when it was recorded (see
// modules/purchase/repository/purchase-return.repository.ts).
export const listPurchaseReturnsQuerySchema = z.object({
  purchaseId: optionalIdString,
  ...paginationQueryFields,
  ...dateRangeQueryFields,
});
export type ListPurchaseReturnsQuery = z.infer<typeof listPurchaseReturnsQuerySchema>;

// Same filters as the list, minus pagination — see Docs/API_STANDARDS.md -> List Export.
export const exportPurchaseReturnsQuerySchema = z.object({
  purchaseId: optionalIdString,
  ...dateRangeQueryFields,
});
export type ExportPurchaseReturnsQuery = z.infer<typeof exportPurchaseReturnsQuerySchema>;
