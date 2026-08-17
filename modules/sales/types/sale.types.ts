// Server-computed breakdown (see modules/pricing/service/tax.service.ts) —
// 2 rows for an intra-state line (CGST+SGST), 1 for inter-state (IGST),
// +1 more if the resolved TaxRate has a non-zero cessPercent.
export type SaleItemTaxView = {
  taxRateId: string | null;
  component: string;
  ratePercent: string;
  amount: string;
};

export type SaleItemView = {
  id: string;
  productId: string;
  quantity: string;
  price: string;
  tax: string;
  taxes: SaleItemTaxView[];
};

export type SaleDiscountView = {
  id: string;
  saleItemId: string | null;
  discountId: string | null;
  couponId: string | null;
  amount: string;
};

// Invoice-level charge (shipping/packing/handling — not tax), snapshot of
// an ExtraCharge catalog entry at the time it was attached to this sale.
export type SaleChargeView = {
  id: string;
  name: string;
  amount: string;
  taxAmount: string;
};

export type SaleView = {
  id: string;
  customerId: string;
  warehouseId: string;
  channel: string;
  status: string;
  saleDate: string;
  taxInclusive?: boolean;
  items: SaleItemView[];
  discounts: SaleDiscountView[];
  charges: SaleChargeView[];
  createdAt: string;
  updatedAt: string;
};
