import { z } from "zod";
import { idString, optionalIdString } from "@/shared/validation/id";
import { positiveDecimalString } from "@/shared/validation/decimal";

export const createSaleSchema = z.object({
  customerId: optionalIdString,
  warehouseId: idString,
  channel: z.enum(["POS", "ONLINE", "MARKETPLACE", "PHONE"]).default("POS"),
  saleDate: z.coerce.date(),
  items: z
    .array(
      z.object({
        productId: idString,
        quantity: positiveDecimalString,
        // No client-supplied price or tax — price is resolved server-side
        // from the current price-list configuration for this product+store
        // (modules/pricing/service/price-list.service.ts's resolvePrice),
        // tax from the product's tax rate (tax.service.ts).
      }),
    )
    .min(1, "at least one item is required"),
  couponCode: z.string().min(1).max(50).optional(),
  taxInclusive: z.boolean().optional(),
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
