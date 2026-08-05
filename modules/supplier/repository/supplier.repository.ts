import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";

export const supplierRepository = {
  findManyByTenant(tenantId: bigint) {
    return prisma.supplier.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
    });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.supplier.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  create(data: Prisma.SupplierUncheckedCreateInput) {
    return prisma.supplier.create({ data });
  },

  update(id: bigint, data: Prisma.SupplierUncheckedUpdateInput) {
    return prisma.supplier.update({ where: { id }, data });
  },

  softDelete(id: bigint) {
    return prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  async hasPurchases(supplierId: bigint): Promise<boolean> {
    const count = await prisma.purchase.count({ where: { supplierId, deletedAt: null } });
    return count > 0;
  },
};
