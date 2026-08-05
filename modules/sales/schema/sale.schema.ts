import { z } from "zod";
import { idString } from "@/shared/validation/id";
import { nonNegativeDecimalString, positiveDecimalString } from "@/shared/validation/decimal";

export const createSaleSchema = z.object({
  customerId: idString,
  warehouseId: idString,
  channel: z.enum(["POS", "ONLINE", "MARKETPLACE", "PHONE"]).default("POS"),
  saleDate: z.coerce.date(),
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
  couponCode: z.string().min(1).max(50).optional(),
  // Zero or more ExtraCharge catalog entries to attach to this sale (e.g.
  // shipping/packing) — resolved and taxed server-side.
  extraChargeIds: z.array(idString).optional(),
});
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const listSalesQuerySchema = z.object({
  status: z
    .enum([
      "PENDING_PAYMENT",
      "DRAFT",
      "CONFIRMED",
      "PROCESSING",
      "PACKED",
      "PARTIALLY_SHIPPED",
      "SHIPPED",
      "DELIVERED",
      "COMPLETED",
      "CANCELLED",
    ])
    .optional(),
  channel: z.enum(["POS", "ONLINE", "MARKETPLACE", "PHONE"]).optional(),
});
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;
