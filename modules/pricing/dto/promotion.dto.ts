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
};
