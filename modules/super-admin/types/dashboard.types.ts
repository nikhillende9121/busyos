export type TenantStatusBreakdown = { status: string; count: number };
export type MonthlyTenantGrowth = { month: string; count: number }; // "2026-08"
export type PlanDistribution = { planId: string; planName: string; count: number };
export type FeatureAdoption = { code: string; name: string; count: number };
export type ExpiringContract = {
  tenantId: string;
  tenantName: string;
  planName: string;
  endDate: string;
  daysRemaining: number;
};

export type SuperAdminDashboardView = {
  totalTenants: number;
  tenantsByStatus: TenantStatusBreakdown[];
  newTenantsLast30Days: number;
  activeContracts: number;
  expiringWithin30Days: number;
  // Plain decimal string — an estimate (yearly contracts normalized to
  // monthly), never a stored/authoritative figure. See
  // modules/super-admin/service/dashboard.service.ts.
  mrrEstimate: string;
  tenantGrowth: MonthlyTenantGrowth[];
  planDistribution: PlanDistribution[];
  featureAdoption: FeatureAdoption[];
  expiringSoonest: ExpiringContract[];
};
