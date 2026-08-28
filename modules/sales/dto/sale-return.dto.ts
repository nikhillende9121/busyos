export type CreateSaleReturnItemDto = {
  saleItemId: bigint;
  quantity: string;
};

export type CreateSaleReturnDto = {
  tenantId: bigint;
  saleId: bigint;
  reason: string;
  items: CreateSaleReturnItemDto[];
  createdBy?: bigint;
  // The caller's warehouse scope (see Docs/business-rules/roles-and-permissions.md
  // -> Warehouse-Scoped Users), not business data.
  scopedWarehouseId?: bigint | null;
};

export type QuoteSaleReturnDto = {
  tenantId: bigint;
  saleId: bigint;
  items: CreateSaleReturnItemDto[];
  scopedWarehouseId?: bigint | null;
};
