import { z } from "zod";
import { idString, optionalIdString } from "@/shared/validation/id";
import { positiveDecimalString } from "@/shared/validation/decimal";
import { paginationQueryFields, dateRangeQueryFields } from "@/shared/validation/list-query";

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

// The delivery person being handed the package — see
// modules/sales/service/sale.service.ts's ship() for the SALE.DELIVER
// eligibility check.
export const shipSaleSchema = z.object({
  assignedDeliveryUserId: idString,
});
export type ShipSaleInput = z.infer<typeof shipSaleSchema>;

const saleListFilterFields = {
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
};

// dateFrom/dateTo filter on saleDate — see modules/sales/repository/sale.repository.ts.
export const listSalesQuerySchema = z.object({
  ...saleListFilterFields,
  ...paginationQueryFields,
  ...dateRangeQueryFields,
});
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;

// Same filters as the list, minus pagination — an export always returns
// every matching row (see Docs/API_STANDARDS.md -> List Export).
export const exportSalesQuerySchema = z.object({
  ...saleListFilterFields,
  ...dateRangeQueryFields,
});
export type ExportSalesQuery = z.infer<typeof exportSalesQuerySchema>;
