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

export type SaleReturnListDto = {
  tenantId: bigint;
  saleId?: bigint;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
  scopedWarehouseId?: bigint | null;
};

export type SaleReturnExportDto = {
  tenantId: bigint;
  saleId?: bigint;
  dateFrom?: Date;
  dateTo?: Date;
  scopedWarehouseId?: bigint | null;
};
