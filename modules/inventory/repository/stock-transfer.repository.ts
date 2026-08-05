import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import type { Prisma, StockTransferStatus } from "@prisma/client";

export const stockTransferRepository = {
  findManyByTenant(tenantId: bigint, scopedWarehouseId?: bigint | null) {
    return prisma.stockTransfer.findMany({
      where: {
        tenantId,
        ...(scopedWarehouseId
          ? { OR: [{ fromWarehouseId: scopedWarehouseId }, { toWarehouseId: scopedWarehouseId }] }
          : {}),
      },
      include: { items: true },
      orderBy: { transferDate: "desc" },
    });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.stockTransfer.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
  },

  create(tx: Db, data: Prisma.StockTransferUncheckedCreateInput) {
    return tx.stockTransfer.create({ data });
  },

  createItem(tx: Db, data: Prisma.StockTransferItemUncheckedCreateInput) {
    return tx.stockTransferItem.create({ data });
  },

  // `data` lets approve() set fromWarehouseId + status in one write —
  // every other stage only ever changes status.
  updateStatus(tx: Db, id: bigint, status: StockTransferStatus, data?: { fromWarehouseId?: bigint }) {
    return tx.stockTransfer.update({ where: { id }, data: { ...data, status } });
  },

  // Mirrors purchaseRepository.updateItemReceivedQuantity's shape — one
  // stage's quantity per call, used by approve/ship/receive.
  updateItemStage(
    tx: Db,
    id: bigint,
    data: { approvedQuantity?: Prisma.Decimal; shippedQuantity?: Prisma.Decimal; receivedQuantity?: Prisma.Decimal },
  ) {
    return tx.stockTransferItem.update({ where: { id }, data });
  },

  findWarehouseForTenant(tenantId: bigint, warehouseId: bigint) {
    return prisma.warehouse.findFirst({ where: { id: warehouseId, tenantId, deletedAt: null } });
  },

  findProductForTenant(tenantId: bigint, productId: bigint) {
    return prisma.product.findFirst({ where: { id: productId, tenantId, deletedAt: null } });
  },
};
