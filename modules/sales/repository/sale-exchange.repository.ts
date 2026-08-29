import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import type { Prisma } from "@prisma/client";

const includeFull = {
  saleReturn: { include: { items: { include: { saleItem: true } } } },
  newSale: { include: { items: { include: { taxes: true } }, discounts: true, charges: true } },
} as const;

// Shared shape for every method below — lets sale-exchange.service.ts type
// its view-conversion helper without repeating this include tree.
export type SaleExchangeWithDetails = Prisma.SaleExchangeGetPayload<{ include: typeof includeFull }>;

type SaleExchangeFilter = {
  warehouseId?: bigint | null;
  dateFrom?: Date;
  dateTo?: Date;
};

function whereClause(tenantId: bigint, filter: SaleExchangeFilter): Prisma.SaleExchangeWhereInput {
  return {
    newSale: { tenantId, ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}) },
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

export const saleExchangeRepository = {
  // skip/take both optional — omitted entirely means "every matching row,"
  // which is what exportList() wants; list() always supplies both.
  findManyByTenant(tenantId: bigint, filter: SaleExchangeFilter & { skip?: number; take?: number }) {
    return prisma.saleExchange.findMany({
      where: whereClause(tenantId, filter),
      include: includeFull,
      orderBy: { createdAt: "desc" },
      ...(filter.skip !== undefined ? { skip: filter.skip } : {}),
      ...(filter.take !== undefined ? { take: filter.take } : {}),
    });
  },

  countByTenant(tenantId: bigint, filter: SaleExchangeFilter) {
    return prisma.saleExchange.count({ where: whereClause(tenantId, filter) });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.saleExchange.findFirst({
      where: { id, newSale: { tenantId } },
      include: includeFull,
    });
  },

  create(tx: Db, data: Prisma.SaleExchangeUncheckedCreateInput) {
    return tx.saleExchange.create({ data, include: includeFull });
  },
};
