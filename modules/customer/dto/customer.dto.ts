export type CreateCustomerDto = {
  tenantId: bigint;
  name: string;
  email?: string;
  phone?: string;
  customerGroupId?: bigint;
  state?: string;
};

export type UpdateCustomerDto = {
  tenantId: bigint;
  customerId: bigint;
  name?: string;
  email?: string;
  phone?: string;
  customerGroupId?: bigint;
  state?: string;
};

export type CustomerListDto = {
  tenantId: bigint;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
};

export type CustomerExportDto = {
  tenantId: bigint;
  dateFrom?: Date;
  dateTo?: Date;
};
