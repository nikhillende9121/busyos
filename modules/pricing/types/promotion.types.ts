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

export type QuoteLineView = {
  productId: string;
  quantity: string;
  unitPrice: string;
  lineSubtotal: string;
  discounts: QuoteLineDiscountView[];
  lineTotal: string;
};

export type QuoteCouponView = {
  couponId: string;
  code: string;
  amount: string;
};

export type QuoteView = {
  lines: QuoteLineView[];
  subtotal: string;
  lineDiscountTotal: string;
  coupon: QuoteCouponView | null;
  grandTotal: string;
};
