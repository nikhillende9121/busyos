export type CreatePurchaseItemDto = {
  productId: bigint;
  quantity: string;
  price: string;
};

export type CreatePurchaseDto = {
  tenantId: bigint;
  supplierId: bigint;
  warehouseId: bigint;
  purchaseDate: Date;
  items: CreatePurchaseItemDto[];
  // Zero or more ExtraCharge catalog entries to attach — see
  // modules/pricing/service/tax.service.ts.
  extraChargeIds?: bigint[];
  createdBy?: bigint;
  // The caller's warehouse scope (see Docs/business-rules/roles-and-permissions.md
  // -> Warehouse-Scoped Users), not business data.
  scopedWarehouseId?: bigint | null;
};

export type ReceivePurchaseBatchDto = {
  batchNumber: string;
  expiryDate?: Date;
  manufacturedDate?: Date;
  quantity: string;
};

export type ReceivePurchaseItemDto = {
  purchaseItemId: bigint;
  receivedQuantity: string;
  // See Docs/batch_expiry_tracking_plan.md §8 — required by the service
  // when the line's product tracks batches, otherwise omitted/ignored.
  batches?: ReceivePurchaseBatchDto[];
};

export type ReceivePurchaseDto = {
  tenantId: bigint;
  purchaseId: bigint;
  items: ReceivePurchaseItemDto[];
  receivedBy?: bigint;
  scopedWarehouseId?: bigint | null;
};

export type PurchaseListDto = {
  tenantId: bigint;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
  scopedWarehouseId?: bigint | null;
};

export type PurchaseExportDto = {
  tenantId: bigint;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  scopedWarehouseId?: bigint | null;
};
