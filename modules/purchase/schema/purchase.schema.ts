import { z } from "zod";
import { idString } from "@/shared/validation/id";
import { nonNegativeDecimalString, positiveDecimalString } from "@/shared/validation/decimal";

export const createPurchaseSchema = z.object({
  supplierId: idString,
  warehouseId: idString,
  purchaseDate: z.coerce.date(),
  items: z
    .array(
      z.object({
        productId: idString,
        quantity: positiveDecimalString,
        price: nonNegativeDecimalString,
        // No client-supplied tax — see modules/pricing/service/tax.service.ts.
        // Computed server-side from the product's tax rate.
      }),
    )
    .min(1, "at least one item is required"),
  // Zero or more ExtraCharge catalog entries to attach (e.g. freight) —
  // resolved and taxed server-side.
  extraChargeIds: z.array(idString).optional(),
});
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;

export const receivePurchaseSchema = z.object({
  items: z
    .array(
      z.object({
        purchaseItemId: idString,
        receivedQuantity: positiveDecimalString,
      }),
    )
    .min(1, "at least one item is required"),
});
export type ReceivePurchaseInput = z.infer<typeof receivePurchaseSchema>;

export const listPurchasesQuerySchema = z.object({
  status: z.enum(["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"]).optional(),
});
export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;
