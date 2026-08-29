import { z } from "zod";
import { idString } from "@/shared/validation/id";
import { paginationQueryFields } from "@/shared/validation/list-query";

const decimalString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "must be a decimal number")
  .refine((value) => Number(value) !== 0, "must not be zero");

const balanceFilterFields = {
  warehouseId: idString.optional(),
  productId: idString.optional(),
  // Matches product name, SKU, or barcode — a barcode scan sends the
  // scanned code through this same param, not a separate one.
  search: z.string().max(200).optional(),
};

// No date-range filter here — InventoryBalance is a current-state snapshot
// per (warehouse, product), not a transaction log, so it has no natural
// date field to filter on (see modules/inventory/repository/inventory.repository.ts).
export const balanceQuerySchema = z.object({
  ...balanceFilterFields,
  ...paginationQueryFields,
});
export type BalanceQuery = z.infer<typeof balanceQuerySchema>;

// Same filters as the list, minus pagination — see Docs/API_STANDARDS.md -> List Export.
export const exportBalanceQuerySchema = z.object({
  ...balanceFilterFields,
});
export type ExportBalanceQuery = z.infer<typeof exportBalanceQuerySchema>;

export const createStockAdjustmentSchema = z.object({
  warehouseId: idString,
  reason: z.string().min(1).max(255),
  items: z
    .array(
      z.object({
        productId: idString,
        quantityDelta: decimalString,
      }),
    )
    .min(1, "at least one item is required"),
});
export type CreateStockAdjustmentInput = z.infer<typeof createStockAdjustmentSchema>;
