export type CreateWarehouseDto = {
  tenantId: bigint;
  name: string;
  code: string;
  address?: string;
  state?: string;
  createdBy?: bigint;
};

export type UpdateWarehouseDto = {
  tenantId: bigint;
  warehouseId: bigint;
  name?: string;
  code?: string;
  address?: string;
  state?: string;
  updatedBy?: bigint;
};
