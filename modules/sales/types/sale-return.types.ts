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
