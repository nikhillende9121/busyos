export type SaleReturnItemView = {
  id: string;
  saleItemId: string;
  productId: string;
  quantity: string;
  // Prorated from the line's actual discounted price, not the undiscounted
  // list price — see Docs/business-rules/sale-return.md -> Discount-Aware
  // Refunds.
  refundAmount: string;
};

export type SaleReturnView = {
  id: string;
  saleId: string;
  reason: string;
  items: SaleReturnItemView[];
  totalRefundAmount: string;
  createdAt: string;
};

// The read-only preview of what POST /sale-returns would compute — same
// per-item/total shape, minus the fields that only exist once a record is
// actually persisted (id, reason, createdAt).
export type SaleReturnQuoteView = {
  items: { saleItemId: string; productId: string; quantity: string; refundAmount: string }[];
  totalRefundAmount: string;
};
