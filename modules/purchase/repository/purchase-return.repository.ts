import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import type { Prisma } from "@prisma/client";

type PurchaseReturnFilter = {
  purchaseId?: bigint;
  warehouseId?: bigint | null;
  dateFrom?: Date;
  dateTo?: Date;
};

function whereClause(tenantId: bigint, filter: PurchaseReturnFilter): Prisma.PurchaseReturnWhereInput {
  return {
    purchase: { tenantId, ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}) },
    ...(filter.purchaseId !== undefined ? { purchaseId: filter.purchaseId } : {}),
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

export const purchaseReturnRepository = {
  // skip/take both optional — omitted entirely means "every matching row,"
  // which is what exportList() wants; list() always supplies both.
  findManyByTenant(tenantId: bigint, filter: PurchaseReturnFilter & { skip?: number; take?: number }) {
    return prisma.purchaseReturn.findMany({
      where: whereClause(tenantId, filter),
      include: { items: { include: { purchaseItem: true } } },
      orderBy: { createdAt: "desc" },
      ...(filter.skip !== undefined ? { skip: filter.skip } : {}),
      ...(filter.take !== undefined ? { take: filter.take } : {}),
    });
  },

  countByTenant(tenantId: bigint, filter: PurchaseReturnFilter) {
    return prisma.purchaseReturn.count({ where: whereClause(tenantId, filter) });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.purchaseReturn.findFirst({
      where: { id, purchase: { tenantId } },
      include: { items: { include: { purchaseItem: true } } },
    });
  },

  findPurchaseForTenant(tenantId: bigint, purchaseId: bigint) {
    return prisma.purchase.findFirst({
      where: { id: purchaseId, tenantId, deletedAt: null },
      include: { items: true },
    });
  },

  create(tx: Db, data: Prisma.PurchaseReturnUncheckedCreateInput) {
    return tx.purchaseReturn.create({ data });
  },

  createItem(tx: Db, data: Prisma.PurchaseReturnItemUncheckedCreateInput) {
    return tx.purchaseReturnItem.create({ data });
  },

  updateItemReturnedQuantity(tx: Db, purchaseItemId: bigint, returnedQuantity: Prisma.Decimal) {
    return tx.purchaseItem.update({ where: { id: purchaseItemId }, data: { returnedQuantity } });
  },
};
