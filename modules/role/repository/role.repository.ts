import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";
import type { Db } from "@/shared/database/transaction-client";

const includePermissions = { rolePermissions: { include: { permission: true } } } as const;

// Prisma queries only, tenant-scoped — see MODULES.md -> repository/.
export const roleRepository = {
  findManyByTenant(tenantId: bigint) {
    return prisma.role.findMany({
      where: { tenantId, deletedAt: null },
      include: includePermissions,
      orderBy: { name: "asc" },
    });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.role.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: includePermissions,
    });
  },

  create(db: Db, data: Prisma.RoleUncheckedCreateInput) {
    return db.role.create({ data });
  },

  update(db: Db, id: bigint, data: Prisma.RoleUncheckedUpdateInput) {
    return db.role.update({ where: { id }, data });
  },

  // Role has no createdBy/updatedBy columns (unlike Warehouse) — nothing
  // to pass beyond the timestamp itself.
  softDelete(id: bigint) {
    return prisma.role.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },

  async hasActiveUsers(roleId: bigint): Promise<boolean> {
    const count = await prisma.user.count({ where: { roleId, deletedAt: null } });
    return count > 0;
  },

  // Validates the caller's submitted codes actually exist in the platform
  // catalog — returned rows may be fewer than requested codes, which the
  // service treats as "some code(s) invalid".
  findPermissionsByCodes(codes: string[]) {
    return prisma.permission.findMany({ where: { code: { in: codes } } });
  },

  async replacePermissions(db: Db, roleId: bigint, permissionIds: bigint[]): Promise<void> {
    await db.rolePermission.deleteMany({ where: { roleId } });
    if (permissionIds.length > 0) {
      await db.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      });
    }
  },

  // No tenantId filter — Permission is a fixed, platform-wide catalog (see
  // Docs/business-rules/roles-and-permissions.md), not tenant-owned data.
  listPermissionCatalog() {
    return prisma.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] });
  },
};
