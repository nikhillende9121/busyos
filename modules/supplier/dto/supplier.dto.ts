export type CreateSupplierDto = {
  tenantId: bigint;
  name: string;
  email?: string;
  phone?: string;
  state?: string;
};

export type UpdateSupplierDto = {
  tenantId: bigint;
  supplierId: bigint;
  name?: string;
  email?: string;
  phone?: string;
  state?: string;
};
