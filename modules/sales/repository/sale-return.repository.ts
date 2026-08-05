import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import type { Prisma } from "@prisma/client";

export const saleReturnRepository = {
  findManyByTenant(tenantId: bigint, filter: { saleId?: bigint; warehouseId?: bigint | null }) {
    return prisma.saleReturn.findMany({
      where: {
        sale: { tenantId, ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}) },
        ...(filter.saleId !== undefined ? { saleId: filter.saleId } : {}),
      },
      include: { items: { include: { saleItem: true } } },
      orderBy: { createdAt: "desc" },
    });
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
