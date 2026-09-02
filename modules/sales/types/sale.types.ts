// Server-computed breakdown (see modules/pricing/service/tax.service.ts) —
// 2 rows for an intra-state line (CGST+SGST), 1 for inter-state (IGST),
// +1 more if the resolved TaxRate has a non-zero cessPercent.
export type SaleItemTaxView = {
  taxRateId: string | null;
  component: string;
  ratePercent: string | number;
  amount: string | number;
};

export type SaleItemView = {
  id: string;
  productId: string;
  productName?: string | null;
  quantity: string | number;
  price: string | number;
  amount?: string | number;
  tax: string | number;
  taxes: SaleItemTaxView[];
};

export type SaleDiscountView = {
  id: string;
  saleItemId: string | null;
  discountId: string | null;
  couponId: string | null;
  amount: string | number;
  isCoupon?: boolean;
};

// Invoice-level charge (shipping/packing/handling — not tax), snapshot of
// an ExtraCharge catalog entry at the time it was attached to this sale.
export type SaleChargeView = {
  id: string;
  name: string;
  amount: string | number;
  taxAmount: string | number;
};

export type SaleView = {
  id: string;
  saleNumber?: string;
  customerId: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  warehouseId: string;
  channel: string;
  status: string;
  saleDate: string;
  taxInclusive?: boolean;
  items: SaleItemView[];
  discounts: SaleDiscountView[];
  charges: SaleChargeView[];
  subtotal?: string | number;
  taxAmount?: string | number;
  totalAmount?: string | number;
  createdAt: string;
  updatedAt: string;
  // Present only for sales created via POST /api/v1/integrations/orders —
  // see Docs/webhooks.md §4.1.
  externalOrderReference?: string | null;
};
