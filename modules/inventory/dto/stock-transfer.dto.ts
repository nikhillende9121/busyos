export type CreateStockTransferItemDto = {
  productId: bigint;
  requestedQuantity: string;
};

export type CreateStockTransferDto = {
  tenantId: bigint;
  toWarehouseId: bigint;
  transferDate: Date;
  items: CreateStockTransferItemDto[];
  createdBy?: bigint;
  scopedWarehouseId?: bigint | null;
};

export type ApproveStockTransferItemDto = {
  stockTransferItemId: bigint;
  approvedQuantity: string;
};

export type ApproveStockTransferDto = {
  tenantId: bigint;
  transferId: bigint;
  fromWarehouseId: bigint;
  items: ApproveStockTransferItemDto[];
  scopedWarehouseId?: bigint | null;
};

export type ShipStockTransferItemDto = {
  stockTransferItemId: bigint;
  shippedQuantity: string;
};

export type ShipStockTransferDto = {
  tenantId: bigint;
  transferId: bigint;
  items: ShipStockTransferItemDto[];
  scopedWarehouseId?: bigint | null;
};

export type ReceiveStockTransferItemDto = {
  stockTransferItemId: bigint;
  receivedQuantity: string;
};

export type ReceiveStockTransferDto = {
  tenantId: bigint;
  transferId: bigint;
  items: ReceiveStockTransferItemDto[];
  scopedWarehouseId?: bigint | null;
};

export type StockTransferListDto = {
  tenantId: bigint;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
  scopedWarehouseId?: bigint | null;
};

export type StockTransferExportDto = {
  tenantId: bigint;
  dateFrom?: Date;
  dateTo?: Date;
  scopedWarehouseId?: bigint | null;
};
