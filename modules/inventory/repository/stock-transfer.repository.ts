import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import type { Prisma, StockTransferStatus } from "@prisma/client";

type StockTransferFilter = {
  warehouseId?: bigint | null;
  dateFrom?: Date;
  dateTo?: Date;
};

function whereClause(tenantId: bigint, filter: StockTransferFilter): Prisma.StockTransferWhereInput {
  return {
    tenantId,
    ...(filter.warehouseId
      ? { OR: [{ fromWarehouseId: filter.warehouseId }, { toWarehouseId: filter.warehouseId }] }
      : {}),
    ...(filter.dateFrom || filter.dateTo
      ? {
          transferDate: {
            ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
            ...(filter.dateTo ? { lte: filter.dateTo } : {}),
          },
        }
      : {}),
  };
}

export const stockTransferRepository = {
  // skip/take both optional — omitted entirely means "every matching row,"
  // which is what exportList() wants; list() always supplies both.
  findManyByTenant(tenantId: bigint, filter: StockTransferFilter & { skip?: number; take?: number }) {
    return prisma.stockTransfer.findMany({
      where: whereClause(tenantId, filter),
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        items: {
          include: { product: true },
        },
      },
      orderBy: { transferDate: "desc" },
      ...(filter.skip !== undefined ? { skip: filter.skip } : {}),
      ...(filter.take !== undefined ? { take: filter.take } : {}),
    });
  },

  countByTenant(tenantId: bigint, filter: StockTransferFilter) {
    return prisma.stockTransfer.count({ where: whereClause(tenantId, filter) });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.stockTransfer.findFirst({
      where: { id, tenantId },
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        items: {
          include: { product: true },
        },
      },
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

  // See Docs/batch_expiry_tracking_plan.md §10 — written at ship() (which
  // batch(es), how much of each, left the source), read back at receive()
  // (to recreate/find the same batch identity at the destination) and
  // cancel() (to credit the source back to the exact batches shipped).
  // productBatch included so callers don't need a second query for
  // batchNumber/expiryDate.
  createItemBatch(tx: Db, data: Prisma.StockTransferItemBatchUncheckedCreateInput) {
    return tx.stockTransferItemBatch.create({ data });
  },

  findItemBatches(tx: Db, stockTransferItemId: bigint) {
    return tx.stockTransferItemBatch.findMany({
      where: { stockTransferItemId },
      include: { productBatch: true },
    });
  },
};
