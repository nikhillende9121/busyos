// One field per lifecycle stage — null until that stage happens. Each is
// capped by the previous (approved <= requested, shipped <= approved,
// received <= shipped), enforced in stock-transfer.service.ts.
export type StockTransferItemView = {
  id: string;
  productId: string;
  requestedQuantity: string;
  approvedQuantity: string | null;
  shippedQuantity: string | null;
  receivedQuantity: string | null;
};

export type StockTransferView = {
  id: string;
  // null until approve() picks the source warehouse — only toWarehouseId
  // is known at request time.
  fromWarehouseId: string | null;
  toWarehouseId: string;
  status: string;
  transferDate: string;
  items: StockTransferItemView[];
  createdAt: string;
  updatedAt: string;
};
