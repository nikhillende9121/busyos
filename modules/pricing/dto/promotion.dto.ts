export type QuoteLineInput = {
  productId: bigint;
  categoryId?: bigint;
  quantity: string;
  unitPrice: string;
};

export type QuoteInput = {
  tenantId: bigint;
  warehouseId: bigint;
  customerId?: bigint;
  customerGroupId?: bigint;
  lines: QuoteLineInput[];
  couponCode?: string;
  extraChargeIds?: bigint[];
  channel?: string;
  // Falls back to the tenant's TenantSetting.taxInclusivePricing when unset
  // — same optionality as CreateSaleDto.taxInclusive (see
  // modules/sales/dto/sale.dto.ts), since this quote is meant to preview
  // exactly what a real Sale created from the same input would compute.
  taxInclusive?: boolean;
};
