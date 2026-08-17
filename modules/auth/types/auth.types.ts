export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type MeTenantView = {
  id: string;
  name: string;
  code: string;
  status: string;
  logoUrl: string | null;
  companyName: string | null;
  gstNumber: string | null;
  currency: string;
  timezone: string;
  invoicePrefix: string | null;
  homeState: string | null;
  taxInclusivePricing: boolean;
};

export type MeView = {
  id: string;
  name: string;
  email: string;
  tenantId: string;
  // Cloudinary URL, set by the Super Admin (see
  // modules/super-admin/service/tenant.service.ts) — rendered at the top
  // of the sidebar (components/layout/sidebar.tsx). null when the tenant
  // hasn't uploaded one.
  tenantLogoUrl: string | null;
  tenant: MeTenantView;
  // null = unrestricted (acts at any warehouse); set = this user is
  // scoped to exactly one store (see shared/utils/assert-warehouse-access.ts
  // and Docs/MOBILE_API_GUIDE.md §3, which flagged this as a gap the
  // client had no direct way to discover). Drives the "Switch to Store
  // view" link (components/layout/sidebar.tsx) and every /store/** page's
  // default warehouse.
  warehouseId: string | null;
  warehouseName: string | null;
  role: {
    id: string;
    name: string;
  };
  permissions: string[];
  // Feature codes the tenant's current plan has enabled — drives nav
  // filtering (components/layout/sidebar.tsx, store-sidebar.tsx) so a
  // link is never shown for a module the tenant's plan doesn't include.
  // Not the enforcement boundary — every route re-checks this itself via
  // shared/middleware/with-api-auth.ts.
  enabledFeatures: string[];
};
