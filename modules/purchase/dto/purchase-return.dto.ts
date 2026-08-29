export type CreatePurchaseReturnItemDto = {
  purchaseItemId: bigint;
  quantity: string;
};

export type CreatePurchaseReturnDto = {
  tenantId: bigint;
  purchaseId: bigint;
  reason: string;
  items: CreatePurchaseReturnItemDto[];
  createdBy?: bigint;
  scopedWarehouseId?: bigint | null;
};

export type PurchaseReturnListDto = {
  tenantId: bigint;
  purchaseId?: bigint;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
  scopedWarehouseId?: bigint | null;
};

export type PurchaseReturnExportDto = {
  tenantId: bigint;
  purchaseId?: bigint;
  dateFrom?: Date;
  dateTo?: Date;
  scopedWarehouseId?: bigint | null;
};
