export type CreateUnitDto = {
  tenantId: bigint;
  name: string;
  symbol: string;
};

export type UpdateUnitDto = {
  tenantId: bigint;
  unitId: bigint;
  name?: string;
  symbol?: string;
};
