export type TokenPair = {
  accessToken: string;
  refreshToken: string;
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
};
