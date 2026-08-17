export type CreateExtraChargeDto = {
  tenantId: bigint;
  name: string;
  calcType: "FLAT" | "PERCENTAGE";
  value: string;
  isTaxable?: boolean;
  taxRateId?: bigint;
  applicableChannels?: string[];
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
  applicableChannels?: string[] | null;
  updatedBy?: bigint;
};
