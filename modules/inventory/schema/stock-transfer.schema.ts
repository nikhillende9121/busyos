import { z } from "zod";
import { idString } from "@/shared/validation/id";
import { positiveDecimalString, nonNegativeDecimalString } from "@/shared/validation/decimal";
import { paginationQueryFields, dateRangeQueryFields } from "@/shared/validation/list-query";

// Only the destination is known at request time — the source warehouse
// isn't chosen until approve(). See Docs/business-rules/stock-transfer.md.
export const createStockTransferSchema = z.object({
  toWarehouseId: idString,
  transferDate: z.coerce.date(),
  items: z
    .array(
      z.object({
        productId: idString,
        requestedQuantity: positiveDecimalString,
      }),
    )
    .min(1, "at least one item is required"),
});
export type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;

// fromWarehouseId !== toWarehouseId can't be checked here — toWarehouseId
// isn't part of this request body, only the transfer it's applied to — so
// that check lives in the service, against the persisted transfer.
// 0 is a valid approvedQuantity — every requested line must be included
// (see resolveStageQuantities in stock-transfer.service.ts), and a line the
// source warehouse simply can't spare any of needs a way to say "none",
// not just "less than requested". requestedQuantity at creation stays
// positive — asking for zero of a product isn't a real request.
export const approveStockTransferSchema = z.object({
  fromWarehouseId: idString,
  items: z
    .array(
      z.object({
        stockTransferItemId: idString,
        approvedQuantity: nonNegativeDecimalString,
      }),
    )
    .min(1, "at least one item is required"),
});
export type ApproveStockTransferInput = z.infer<typeof approveStockTransferSchema>;

// Allows 0 for the same reason as approvedQuantity above — a line approved
// at 0 must still be shippable at 0 (every item is required at every stage).
export const shipStockTransferSchema = z.object({
  items: z
    .array(
      z.object({
        stockTransferItemId: idString,
        shippedQuantity: nonNegativeDecimalString,
      }),
    )
    .min(1, "at least one item is required"),
});
export type ShipStockTransferInput = z.infer<typeof shipStockTransferSchema>;

export const receiveStockTransferSchema = z.object({
  items: z
    .array(
      z.object({
        stockTransferItemId: idString,
        receivedQuantity: nonNegativeDecimalString,
      }),
    )
    .min(1, "at least one item is required"),
});
export type ReceiveStockTransferInput = z.infer<typeof receiveStockTransferSchema>;

// dateFrom/dateTo filter on transferDate (see
// modules/inventory/repository/stock-transfer.repository.ts).
export const listStockTransfersQuerySchema = z.object({
  ...paginationQueryFields,
  ...dateRangeQueryFields,
});
export type ListStockTransfersQuery = z.infer<typeof listStockTransfersQuerySchema>;

// Same filters as the list, minus pagination — see Docs/API_STANDARDS.md -> List Export.
export const exportStockTransfersQuerySchema = z.object({
  ...dateRangeQueryFields,
});
export type ExportStockTransfersQuery = z.infer<typeof exportStockTransfersQuerySchema>;
