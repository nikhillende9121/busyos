export type CreateContractDto = {
  tenantId: bigint;
  planId: bigint;
  startDate: Date;
  endDate: Date;
};

export type CancelContractDto = {
  tenantId: bigint;
  subscriptionId: bigint;
};
