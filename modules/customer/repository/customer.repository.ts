import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";

export const customerRepository = {
  findManyByTenant(tenantId: bigint) {
    return prisma.customer.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
    });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.customer.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  create(data: Prisma.CustomerUncheckedCreateInput) {
    return prisma.customer.create({ data });
  },

  update(id: bigint, data: Prisma.CustomerUncheckedUpdateInput) {
    return prisma.customer.update({ where: { id }, data });
  },

  softDelete(id: bigint) {
    return prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  async hasSales(customerId: bigint): Promise<boolean> {
    const count = await prisma.sale.count({ where: { customerId, deletedAt: null } });
    return count > 0;
  },

  findCustomerGroupForTenant(tenantId: bigint, customerGroupId: bigint) {
    return prisma.customerGroup.findFirst({ where: { id: customerGroupId, tenantId } });
  },
};
