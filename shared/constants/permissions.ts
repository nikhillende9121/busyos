// Shared between prisma/seed.ts (demo Admin bootstrap) and
// modules/super-admin/service/tenant.service.ts (new-tenant Admin
// bootstrap) — both grant a fresh Admin role "every permission in the
// catalog," which is correct for real capabilities but wrong for
// STORE.ACCESS: that code isn't a capability, it's a pure login-redirect
// signal (see app/login/page.tsx) that must be deliberately toggled on a
// role via the Roles screen, never inherited for free.
export const NON_INHERITABLE_PERMISSION_CODES = new Set(["STORE.ACCESS"]);
