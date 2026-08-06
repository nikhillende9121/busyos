import { prisma } from "@/shared/database/prisma";

// Narrow, mockable DB reads used only by the request pipeline (with-api-auth.ts).
// Kept separate from any module's repository: Feature/Permission/TenantFeature/
// RolePermission are platform/RBAC infrastructure, not owned by a single
// business domain (see AI_AGENT.md -> Shared Directory: cross-cutting code,
// not business logic, belongs in shared/).
export const rbacLookup = {
  findTenantById(tenantId: bigint) {
    return prisma.tenant.findUnique({ where: { id: tenantId } });
  },

  async isFeatureEnabledForTenant(tenantId: bigint, featureCode: string): Promise<boolean> {
    const tenantFeature = await prisma.tenantFeature.findFirst({
      where: { tenantId, enabled: true, feature: { code: featureCode } },
    });
    return tenantFeature !== null;
  },

  // Used by GET /api/v1/auth/me — same reasoning as
  // listPermissionCodesForRole: the client needs the full enabled set to
  // hide nav items/buttons for features the tenant's plan doesn't include,
  // rather than showing a link and letting isFeatureEnabledForTenant 403
  // it on click.
  async listEnabledFeatureCodesForTenant(tenantId: bigint): Promise<string[]> {
    const tenantFeatures = await prisma.tenantFeature.findMany({
      where: { tenantId, enabled: true },
      include: { feature: true },
    });
    return tenantFeatures.map((tf) => tf.feature.code);
  },

  async roleHasPermission(roleId: bigint, permissionCode: string): Promise<boolean> {
    const rolePermission = await prisma.rolePermission.findFirst({
      where: { roleId, permission: { code: permissionCode } },
    });
    return rolePermission !== null;
  },

  // Used by GET /api/v1/auth/me so a client can know what to show (nav
  // items, action buttons) without trial-and-error 403s — permissions are
  // never embedded in the JWT (see roleHasPermission above), so this is the
  // only way to learn the full set for the caller's role.
  async listPermissionCodesForRole(roleId: bigint): Promise<string[]> {
    const rolePermissions = await prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });
    return rolePermissions.map((rp) => rp.permission.code);
  },

  // null = unrestricted (acts at any of the tenant's warehouses); set =
  // restricted to that one store — see prisma/schema.prisma's User.warehouseId
  // and Docs/business-rules/roles-and-permissions.md -> Warehouse-Scoped
  // Users. Checked fresh per-request, same reasoning as roleHasPermission
  // above: reassigning a user's store takes effect on their next request.
  async findUserWarehouseScope(userId: bigint): Promise<bigint | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { warehouseId: true },
    });
    return user?.warehouseId ?? null;
  },
};
