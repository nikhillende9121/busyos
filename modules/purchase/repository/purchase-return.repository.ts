import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import type { Prisma } from "@prisma/client";

export const purchaseReturnRepository = {
  findManyByTenant(tenantId: bigint, filter: { purchaseId?: bigint; warehouseId?: bigint | null }) {
    return prisma.purchaseReturn.findMany({
      where: {
        purchase: { tenantId, ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}) },
        ...(filter.purchaseId !== undefined ? { purchaseId: filter.purchaseId } : {}),
      },
      include: { items: { include: { purchaseItem: true } } },
      orderBy: { createdAt: "desc" },
    });
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
