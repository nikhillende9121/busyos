export type CreateCustomerGroupDto = {
  tenantId: bigint;
  name: string;
  code: string;
};

export type UpdateCustomerGroupDto = {
  tenantId: bigint;
  customerGroupId: bigint;
  name?: string;
  code?: string;
};
