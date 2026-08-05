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
