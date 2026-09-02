import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";

const includeRole = { role: true, warehouse: true } as const;

// Prisma queries only, tenant-scoped — see MODULES.md -> repository/.
export const userRepository = {
  findManyByTenant(tenantId: bigint) {
    return prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      include: includeRole,
      orderBy: { name: "asc" },
    });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: includeRole,
    });
  },

  // Powers the "who can this be assigned to" picker (e.g. delivery-person
  // assignment on a shipped sale) — a minimal {id, name} list, not the
  // full user record, since a caller with e.g. SALE.SHIP but not
  // USER.VIEW still needs to see it.
  findManyByTenantWithPermission(tenantId: bigint, permissionCode: string) {
    return prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        role: { rolePermissions: { some: { permission: { code: permissionCode } } } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  },

  findRoleForTenant(tenantId: bigint, roleId: bigint) {
    return prisma.role.findFirst({ where: { id: roleId, tenantId, deletedAt: null } });
  },

  findWarehouseForTenant(tenantId: bigint, warehouseId: bigint) {
    return prisma.warehouse.findFirst({ where: { id: warehouseId, tenantId, deletedAt: null } });
  },

  // Backs the plan-limit check in user.service.ts's create() — a
  // soft-deleted user no longer counts against the quota.
  countActiveByTenant(tenantId: bigint) {
    return prisma.user.count({ where: { tenantId, deletedAt: null } });
  },

  create(data: Prisma.UserUncheckedCreateInput) {
    return prisma.user.create({ data, include: includeRole });
  },

  update(id: bigint, data: Prisma.UserUncheckedUpdateInput) {
    return prisma.user.update({ where: { id }, data, include: includeRole });
  },

  softDelete(id: bigint, deletedBy?: bigint) {
    return prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy },
    });
  },
};
