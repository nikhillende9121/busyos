import type { SaleChannel } from "@prisma/client";

export type CreateSaleItemDto = {
  productId: bigint;
  quantity: string;
};

export type CreateSaleDto = {
  tenantId: bigint;
  customerId: bigint;
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
};

export type SaleListDto = {
  tenantId: bigint;
  status?: string;
  channel?: string;
  scopedWarehouseId?: bigint | null;
};
