// Response shape returned to clients — deliberately not the raw Prisma
// Tenant/TenantSetting rows (see MODULES.md -> types/). Ids are strings:
// BigInt survives JSON.stringify only via the shared/utils/bigint-json.ts
// safety-net polyfill, but an explicit string here keeps the contract
// intentional rather than relying on that net.
export type TenantSettingsView = {
  companyName: string | null;
  gstNumber: string | null;
  currency: string;
  timezone: string;
  invoicePrefix: string | null;
  decimalPrecision: number;
  homeState: string | null;
  taxInclusivePricing: boolean;
  defaultTaxRateId: string | null;
};

export type TenantProfile = {
  id: string;
  name: string;
  code: string;
  status: string;
  settings: TenantSettingsView | null;
};
