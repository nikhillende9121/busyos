export type CreateExtraChargeDto = {
  tenantId: bigint;
  name: string;
  calcType: "FLAT" | "PERCENTAGE";
  value: string;
  isTaxable?: boolean;
  taxRateId?: bigint;
  createdBy?: bigint;
};

export type UpdateExtraChargeDto = {
  tenantId: bigint;
  extraChargeId: bigint;
  name?: string;
  calcType?: "FLAT" | "PERCENTAGE";
  value?: string;
  isTaxable?: boolean;
  taxRateId?: bigint | null;
  isActive?: boolean;
  updatedBy?: bigint;
};
