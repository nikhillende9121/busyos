import { z } from "zod";
import { idString } from "@/shared/validation/id";

const decimalString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "must be a decimal number")
  .refine((value) => Number(value) !== 0, "must not be zero");

export const balanceQuerySchema = z.object({
  warehouseId: idString.optional(),
  productId: idString.optional(),
});
export type BalanceQuery = z.infer<typeof balanceQuerySchema>;

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
