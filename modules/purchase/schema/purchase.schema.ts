import { z } from "zod";
import { idString } from "@/shared/validation/id";
import { nonNegativeDecimalString, positiveDecimalString } from "@/shared/validation/decimal";
import { paginationQueryFields, dateRangeQueryFields } from "@/shared/validation/list-query";

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
        // Required (checked in the service, which knows the product's
        // trackBatches flag — the schema layer doesn't) when the line's
        // product tracks batches; sum of quantities must equal
        // receivedQuantity. See Docs/batch_expiry_tracking_plan.md §8.
        batches: z
          .array(
            z.object({
              batchNumber: z.string().min(1).max(100),
              expiryDate: z.coerce.date().optional(),
              manufacturedDate: z.coerce.date().optional(),
              quantity: positiveDecimalString,
            }),
          )
          .optional(),
      }),
    )
    .min(1, "at least one item is required"),
});
export type ReceivePurchaseInput = z.infer<typeof receivePurchaseSchema>;

const purchaseListFilterFields = {
  status: z.enum(["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"]).optional(),
};

// dateFrom/dateTo filter on purchaseDate — see modules/purchase/repository/purchase.repository.ts.
export const listPurchasesQuerySchema = z.object({
  ...purchaseListFilterFields,
  ...paginationQueryFields,
  ...dateRangeQueryFields,
});
export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;

// Same filters as the list, minus pagination — see Docs/API_STANDARDS.md -> List Export.
export const exportPurchasesQuerySchema = z.object({
  ...purchaseListFilterFields,
  ...dateRangeQueryFields,
});
export type ExportPurchasesQuery = z.infer<typeof exportPurchasesQuerySchema>;
