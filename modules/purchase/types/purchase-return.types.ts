export type PurchaseReturnItemView = {
  id: string;
  purchaseItemId: string;
  productId: string;
  quantity: string;
};

export type PurchaseReturnView = {
  id: string;
  purchaseId: string;
  reason: string;
  items: PurchaseReturnItemView[];
  createdAt: string;
};
