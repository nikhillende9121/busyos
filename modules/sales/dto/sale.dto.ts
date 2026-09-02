import type { SaleChannel } from "@prisma/client";

export type CreateSaleItemDto = {
  productId: bigint;
  quantity: string;
};

export type CreateSaleDto = {
  tenantId: bigint;
  customerId?: bigint | null;
  warehouseId: bigint;
  channel: SaleChannel;
  saleDate: Date;
  items: CreateSaleItemDto[];
  // Applied (and, if it has a usage limit, redeemed) at creation time, not
  // at confirm — see Docs/business-rules/discounts-and-coupons.md ->
  // Applying at Creation vs. Confirmation for the tradeoff this accepts
  // (an abandoned DRAFT sale can consume a limited coupon's usage slot).
  couponCode?: string;
  taxInclusive?: boolean;
  // Zero or more ExtraCharge catalog entries to attach — see
  // modules/pricing/service/tax.service.ts.
  extraChargeIds?: bigint[];
  createdBy?: bigint;
  // The caller's warehouse scope (see Docs/business-rules/roles-and-permissions.md
  // -> Warehouse-Scoped Users), not business data — null/omitted means
  // unrestricted.
  scopedWarehouseId?: bigint | null;
  // Set only when this sale originates from POST /api/v1/integrations/orders
  // — see modules/webhook/service/order-ingestion.service.ts and
  // Docs/webhooks.md §4.1. Omitted for every other channel.
  webhookIntegrationId?: bigint;
  externalOrderReference?: string;
};

export type SaleListDto = {
  tenantId: bigint;
  status?: string;
  channel?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
  scopedWarehouseId?: bigint | null;
  // The caller's own identity — used only to narrow the list to their own
  // assigned deliveries when their role holds SALE.DELIVER but not the
  // broader SALE.UPDATE override (see saleService's resolveDeliveryScope).
  // Not business data, same reasoning as scopedWarehouseId.
  requestingUserId?: bigint;
  requestingRoleId?: bigint;
};

export type SaleExportDto = {
  tenantId: bigint;
  status?: string;
  channel?: string;
  dateFrom?: Date;
  dateTo?: Date;
  scopedWarehouseId?: bigint | null;
  requestingUserId?: bigint;
  requestingRoleId?: bigint;
};
