import { prisma } from "@/shared/database/prisma";

// Prisma queries only — no business rules, no permission/feature checks
// (see MODULES.md -> repository/). Tenant resolution by code is the one
// query in this module allowed to run without a tenantId filter, since
// resolving the tenant IS the query.
export const authRepository = {
  findTenantByCode(code: string) {
    return prisma.tenant.findUnique({
      where: { code },
    });
  },

  findTenantById(tenantId: bigint) {
    return prisma.tenant.findUnique({
      where: { id: tenantId },
    });
  },

  findActiveUserByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: { tenant: true },
    });
  },

  findUserById(tenantId: bigint, userId: bigint) {
    return prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
    });
  },

  // Separate from findUserById (above) rather than adding `include` to it:
  // that method's return shape is already relied on by authService.refresh,
  // and this one is only for the /auth/me profile view. `tenant`/`warehouse`
  // are included alongside `role` so `me()` can read the tenant's logo and
  // the caller's own warehouse scope without extra queries.
  findUserWithRoleById(tenantId: bigint, userId: bigint) {
    return prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      include: { role: true, tenant: { include: { settings: true } }, warehouse: true },
    });
  },

  recordDeviceLogin(params: { tenantId: bigint; userId: bigint; deviceId: string }) {
    return prisma.userDevice.upsert({
      where: {
        userId_deviceId: {
          userId: params.userId,
          deviceId: params.deviceId,
        },
      },
      create: {
        tenantId: params.tenantId,
        userId: params.userId,
        deviceId: params.deviceId,
        lastLoginAt: new Date(),
      },
      update: {
        lastLoginAt: new Date(),
      },
    });
  },
};
