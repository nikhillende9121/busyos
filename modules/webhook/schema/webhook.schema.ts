import { z } from "zod";
import { optionalIdString } from "@/shared/validation/id";
import { positiveDecimalString } from "@/shared/validation/decimal";

// Mirrors prisma/schema.prisma's WebhookEventType enum exactly — kept as
// a plain string array here (not imported from @prisma/client) so this
// schema file has no Prisma dependency, same convention as every other
// module's schema/ files.
export const WEBHOOK_EVENT_TYPES = [
  "PRODUCT_CREATED",
  "PRODUCT_UPDATED",
  "PRODUCT_DELETED",
  "PRICE_LIST_CREATED",
  "PRICE_LIST_UPDATED",
  "DISCOUNT_CREATED",
  "DISCOUNT_UPDATED",
  "DISCOUNT_DELETED",
  "COUPON_CREATED",
  "COUPON_UPDATED",
  "COUPON_DELETED",
  "INVENTORY_UPDATED",
] as const;

export const createWebhookEndpointSchema = z.object({
  url: z.string().min(1).max(500),
  eventTypes: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1, "at least one event type is required"),
});
export type CreateWebhookEndpointInput = z.infer<typeof createWebhookEndpointSchema>;

export const updateWebhookEndpointSchema = z.object({
  url: z.string().min(1).max(500).optional(),
  eventTypes: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateWebhookEndpointInput = z.infer<typeof updateWebhookEndpointSchema>;

export const updateIntegrationSchema = z.object({
  defaultOnlineWarehouseId: optionalIdString,
  isEnabled: z.boolean().optional(),
});
export type UpdateIntegrationInput = z.infer<typeof updateIntegrationSchema>;

export const listDeliveriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Inbound order payload — POST /api/v1/integrations/orders. Line items are
// resolved by sku/barcode (the tenant's own product ids), never by
// internal productId, and never carry a price — see Docs/webhooks.md §4.
export const createInboundOrderSchema = z.object({
  externalOrderReference: z.string().min(1).max(150).optional(),
  // The tenant's own internal customerId, if the caller already has one on
  // file (e.g. a repeat customer the tenant has previously created here).
  // Required whenever the tenant's plan has the CUSTOMER feature enabled,
  // same rule POST /sales already enforces — see saleService.create().
  customerId: optionalIdString,
  couponCode: z.string().optional(),
  items: z
    .array(
      z.object({
        skuOrBarcode: z.string().min(1),
        quantity: positiveDecimalString,
      }),
    )
    .min(1, "at least one item is required"),
});
export type CreateInboundOrderInput = z.infer<typeof createInboundOrderSchema>;
