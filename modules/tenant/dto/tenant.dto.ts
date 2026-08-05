export type UpdateTenantSettingsDto = {
  tenantId: bigint;
  companyName?: string;
  gstNumber?: string;
  currency?: string;
  timezone?: string;
  invoicePrefix?: string;
  decimalPrecision?: number;
  homeState?: string;
  taxInclusivePricing?: boolean;
  defaultTaxRateId?: bigint | null;
};
