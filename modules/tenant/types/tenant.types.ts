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

// Read-only — there is no edit endpoint for a tenant's own subscription;
// contracts are managed exclusively by a Super Admin (see
// modules/super-admin/service/subscription.service.ts) and are immutable
// once created. null only when a tenant somehow has no subscription on
// record at all (shouldn't happen post-onboarding).
export type TenantSubscriptionView = {
  status: string;
  // Computed, not stored — see ContractView's identical field
  // (modules/super-admin/types/subscription.types.ts) for why.
  isExpiredByDate: boolean;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  priceAtSigning: string;
  plan: {
    name: string;
    billingCycle: string;
    maxWarehouses: number | null;
    maxUsers: number | null;
    maxRoles: number | null;
  };
  features: { code: string; name: string }[];
};
