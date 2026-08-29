import { z } from "zod";
import { idString, optionalIdString } from "@/shared/validation/id";
import { positiveDecimalString } from "@/shared/validation/decimal";
import { paginationQueryFields, dateRangeQueryFields } from "@/shared/validation/list-query";

export const createSaleReturnSchema = z.object({
  saleId: idString,
  reason: z.string().min(1).max(255),
  items: z
    .array(
      z.object({
        saleItemId: idString,
        quantity: positiveDecimalString,
      }),
    )
    .min(1, "at least one item is required"),
});
export type CreateSaleReturnInput = z.infer<typeof createSaleReturnSchema>;

// Same item shape as create, minus `reason` — a preview never persists a
// record, so there's nothing to attach a reason to yet.
export const quoteSaleReturnSchema = z.object({
  saleId: idString,
  items: z
    .array(
      z.object({
        saleItemId: idString,
        quantity: positiveDecimalString,
      }),
    )
    .min(1, "at least one item is required"),
});
export type QuoteSaleReturnInput = z.infer<typeof quoteSaleReturnSchema>;

// dateFrom/dateTo filter on createdAt — a sale return has no date of its
// own beyond when it was recorded (see
// modules/sales/repository/sale-return.repository.ts).
export const listSaleReturnsQuerySchema = z.object({
  saleId: optionalIdString,
  ...paginationQueryFields,
  ...dateRangeQueryFields,
});
export type ListSaleReturnsQuery = z.infer<typeof listSaleReturnsQuerySchema>;

// Same filters as the list, minus pagination — see Docs/API_STANDARDS.md -> List Export.
export const exportSaleReturnsQuerySchema = z.object({
  saleId: optionalIdString,
  ...dateRangeQueryFields,
});
export type ExportSaleReturnsQuery = z.infer<typeof exportSaleReturnsQuerySchema>;
