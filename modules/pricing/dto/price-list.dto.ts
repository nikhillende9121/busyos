export type CreatePriceListItemDto = {
  productId: bigint;
  price: string;
  minQuantity?: string;
};

export type CreatePriceListDto = {
  tenantId: bigint;
  name: string;
  warehouseId?: bigint;
  customerGroupId?: bigint;
  customerId?: bigint;
  currency?: string;
  isDefault?: boolean;
  items: CreatePriceListItemDto[];
};

export type ResolvePriceDto = {
  tenantId: bigint;
  productId: bigint;
  warehouseId?: bigint;
  customerGroupId?: bigint;
  customerId?: bigint;
  quantity: string;
};
