export type CreateTaxRateDto = {
  tenantId: bigint;
  name: string;
  hsnCode?: string;
  sacCode?: string;
  ratePercent: string;
  cessPercent?: string;
  createdBy?: bigint;
};

export type UpdateTaxRateDto = {
  tenantId: bigint;
  taxRateId: bigint;
  name?: string;
  hsnCode?: string;
  sacCode?: string;
  ratePercent?: string;
  cessPercent?: string;
  isActive?: boolean;
  updatedBy?: bigint;
};
