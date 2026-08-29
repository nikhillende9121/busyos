import type { PaymentMethod } from "@prisma/client";

export type CreateSaleExchangeReturnItemDto = {
  saleItemId: bigint;
  quantity: string;
};

export type CreateSaleExchangeNewItemDto = {
  productId: bigint;
  quantity: string;
};

export type CreateSaleExchangeDto = {
  tenantId: bigint;
  saleId: bigint;
  reason: string;
  returnItems: CreateSaleExchangeReturnItemDto[];
  newItems: CreateSaleExchangeNewItemDto[];
  // Applied to the new items only — the returned side is never re-discounted,
  // see Docs/business-rules/sale-exchange.md.
  couponCode?: string;
  extraChargeIds?: bigint[];
  // Falls back to the tenant's TenantSetting.taxInclusivePricing when unset
  // — same optionality as CreateSaleDto.taxInclusive.
  taxInclusive?: boolean;
  // How the settlement difference (either direction) is collected/refunded.
  paymentMethod: PaymentMethod;
  createdBy?: bigint;
  // The caller's warehouse scope (see Docs/business-rules/roles-and-permissions.md
  // -> Warehouse-Scoped Users), not business data.
  scopedWarehouseId?: bigint | null;
};

export type QuoteSaleExchangeDto = {
  tenantId: bigint;
  saleId: bigint;
  returnItems: CreateSaleExchangeReturnItemDto[];
  newItems: CreateSaleExchangeNewItemDto[];
  couponCode?: string;
  extraChargeIds?: bigint[];
  taxInclusive?: boolean;
  scopedWarehouseId?: bigint | null;
};
