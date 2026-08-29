import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import type { Prisma } from "@prisma/client";

type SaleReturnFilter = {
  saleId?: bigint;
  warehouseId?: bigint | null;
  dateFrom?: Date;
  dateTo?: Date;
};

function whereClause(tenantId: bigint, filter: SaleReturnFilter): Prisma.SaleReturnWhereInput {
  return {
    sale: { tenantId, ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}) },
    ...(filter.saleId !== undefined ? { saleId: filter.saleId } : {}),
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

export const saleReturnRepository = {
  // skip/take both optional — omitted entirely means "every matching row,"
  // which is what exportList() wants; list() always supplies both.
  findManyByTenant(tenantId: bigint, filter: SaleReturnFilter & { skip?: number; take?: number }) {
    return prisma.saleReturn.findMany({
      where: whereClause(tenantId, filter),
      include: { items: { include: { saleItem: true } } },
      orderBy: { createdAt: "desc" },
      ...(filter.skip !== undefined ? { skip: filter.skip } : {}),
      ...(filter.take !== undefined ? { take: filter.take } : {}),
    });
  },

  countByTenant(tenantId: bigint, filter: SaleReturnFilter) {
    return prisma.saleReturn.count({ where: whereClause(tenantId, filter) });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.saleReturn.findFirst({
      where: { id, sale: { tenantId } },
      include: { items: { include: { saleItem: true } } },
    });
  },

  // discounts included so the service can prorate a discounted refund — see
  // Docs/business-rules/sale-return.md -> Discount-Aware Refunds.
  findSaleForTenant(tenantId: bigint, saleId: bigint) {
    return prisma.sale.findFirst({
      where: { id: saleId, tenantId, deletedAt: null },
      include: { items: true, discounts: true },
    });
  },

  create(tx: Db, data: Prisma.SaleReturnUncheckedCreateInput) {
    return tx.saleReturn.create({ data });
  },

  createItem(tx: Db, data: Prisma.SaleReturnItemUncheckedCreateInput) {
    return tx.saleReturnItem.create({ data });
  },

  updateItemReturnedQuantity(tx: Db, saleItemId: bigint, returnedQuantity: Prisma.Decimal) {
    return tx.saleItem.update({ where: { id: saleItemId }, data: { returnedQuantity } });
  },
};
