// Exactly one of discountId/couponId is set: a line-level Discount, or a
// PRODUCT/CATEGORY-scoped Coupon reducing this specific line (see
// promotion.service.ts). An ORDER-scope coupon never appears here — it
// shows up only in QuoteView.coupon, applied once to the whole order.
export type QuoteLineDiscountView = {
  discountId?: string;
  couponId?: string;
  name: string;
  amount: string;
};

// Mirrors SaleItemTax's shape exactly (see modules/sales/types/sale.types.ts
// -> SaleItemView.taxes) — a client renders a quote line and a persisted
// sale line with the same component, not two different shapes for the same
// data.
export type QuoteLineTaxComponentView = {
  taxRateId: string | null;
  component: string;
  ratePercent: string;
  amount: string;
};

export type QuoteLineView = {
  productId: string;
  quantity: string;
  unitPrice: string;
  lineSubtotal: string;
  discounts: QuoteLineDiscountView[];
  lineTotal: string;
  // Computed on lineTotal (post-discount/coupon) — see
  // Docs/business-rules/discounts-and-coupons.md's order of operations.
  // Total is informational, same as SaleItemView.tax: whether it's already
  // included in lineTotal or owed on top depends on QuoteView.taxInclusive.
  tax: string;
  taxes: QuoteLineTaxComponentView[];
};

export type QuoteCouponView = {
  couponId: string;
  code: string;
  amount: string;
};

export type QuoteChargeView = {
  extraChargeId: string;
  taxRateId: string | null;
  name: string;
  amount: string;
  taxAmount: string;
};

export type QuoteView = {
  lines: QuoteLineView[];
  subtotal: string;
  lineDiscountTotal: string;
  coupon: QuoteCouponView | null;
  charges: QuoteChargeView[];
  chargesTotal: string;
  chargesTaxTotal: string;
  // Sum of every line's tax + every charge's tax — shown for the GST
  // breakdown. Not always additive into grandTotal: see taxInclusive.
  taxTotal: string;
  // Echoes back what tax mode this quote was actually computed under
  // (resolved from the request, falling back to the tenant's
  // TenantSetting.taxInclusivePricing) — a client needs this to know
  // whether taxTotal is already included in grandTotal or owed on top,
  // same distinction Sale.taxInclusive/toSaleView draws for a persisted
  // sale (see modules/sales/service/sale.service.ts).
  taxInclusive: boolean;
  grandTotal: string;
};
