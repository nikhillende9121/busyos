export type SuperAdminTenantView = {
  id: string;
  name: string;
  code: string;
  status: string;
  logoUrl: string | null;
  // null only if the tenant somehow has no ACTIVE/TRIAL subscription at
  // all — see modules/super-admin/repository/tenant.repository.ts's
  // includeCurrentPlan.
  currentPlanId: string | null;
  currentPlanName: string | null;
  createdAt: string;
  updatedAt: string;
};
