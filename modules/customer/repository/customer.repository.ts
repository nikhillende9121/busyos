import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";

type CustomerFilter = {
  dateFrom?: Date;
  dateTo?: Date;
};

function whereClause(tenantId: bigint, filter: CustomerFilter): Prisma.CustomerWhereInput {
  return {
    tenantId,
    deletedAt: null,
    ...(filter.dateFrom || filter.dateTo
      ? {
          createdAt: {
            ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
            ...(filter.dateTo ? { lte: filter.dateTo } : {}),
          },
        }
      : {}),
  };
}

export const customerRepository = {
  // skip/take both optional — omitted entirely means "every matching row,"
  // which is what exportList() wants; list() always supplies both.
  findManyByTenant(tenantId: bigint, filter: CustomerFilter & { skip?: number; take?: number }) {
    return prisma.customer.findMany({
      where: whereClause(tenantId, filter),
      orderBy: { name: "asc" },
      ...(filter.skip !== undefined ? { skip: filter.skip } : {}),
      ...(filter.take !== undefined ? { take: filter.take } : {}),
    });
  },

  countByTenant(tenantId: bigint, filter: CustomerFilter) {
    return prisma.customer.count({ where: whereClause(tenantId, filter) });
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
