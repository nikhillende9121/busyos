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

  findRoleForTenant(tenantId: bigint, roleId: bigint) {
    return prisma.role.findFirst({ where: { id: roleId, tenantId, deletedAt: null } });
  },

  findWarehouseForTenant(tenantId: bigint, warehouseId: bigint) {
    return prisma.warehouse.findFirst({ where: { id: warehouseId, tenantId, deletedAt: null } });
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
