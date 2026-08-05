import { Prisma } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";

type BalanceFilter = {
  warehouseId?: bigint;
  productId?: bigint;
};

export const inventoryRepository = {
  listBalancesByTenant(tenantId: bigint, filter: BalanceFilter) {
    return prisma.inventoryBalance.findMany({
      where: {
        tenantId,
        ...(filter.warehouseId !== undefined ? { warehouseId: filter.warehouseId } : {}),
        ...(filter.productId !== undefined ? { productId: filter.productId } : {}),
      },
      orderBy: [{ warehouseId: "asc" }, { productId: "asc" }],
    });
  },

  // Two statements, same transaction, on the path to every stock movement:
  //
  // 1. Guarantee the (warehouseId, productId) balance row exists. A
  //    genuinely first-ever movement for a pair has no row yet, and
  //    `SELECT ... FOR UPDATE` cannot lock a row that doesn't exist —
  //    without this step, two concurrent first movements could both read
  //    "no row = 0" and both proceed as if uncontested.
  // 2. Lock and read the now-guaranteed-to-exist row, so a second
  //    concurrent movement against the same pair blocks until this
  //    transaction commits, instead of both computing a new balance off
  //    the same stale read.
  //
  // Raw SQL is AI_AGENT.md's documented "absolutely necessary" exception:
  // Prisma's fluent API has no SELECT ... FOR UPDATE. Column names below
  // match prisma/schema.prisma's field names exactly, since no per-field
  // @map(...) is defined (see the naming-convention note raised alongside
  // this module) — dbTable/@@map only renames the table, not its columns.
  async ensureAndLockBalance(
    tx: Db,
    tenantId: bigint,
    warehouseId: bigint,
    productId: bigint,
  ): Promise<Prisma.Decimal> {
    await tx.$executeRaw`
      INSERT INTO inventory_balance (tenantId, warehouseId, productId, quantity, updatedAt)
      VALUES (${tenantId}, ${warehouseId}, ${productId}, 0, NOW())
      ON DUPLICATE KEY UPDATE quantity = quantity
    `;
    const rows = await tx.$queryRaw<{ quantity: unknown }[]>`
      SELECT quantity FROM inventory_balance
      WHERE warehouseId = ${warehouseId} AND productId = ${productId}
      FOR UPDATE
    `;
    // Normalized defensively: the exact JS type a raw query returns for a
    // DECIMAL column varies by driver adapter (string vs number vs a
    // decimal-like object) — Prisma.Decimal accepts any of them.
    return new Prisma.Decimal(rows[0].quantity as Prisma.Decimal.Value);
  },

  updateBalance(
    tx: Db,
    params: { warehouseId: bigint; productId: bigint; newQuantity: Prisma.Decimal },
  ) {
    return tx.inventoryBalance.update({
      where: {
        warehouseId_productId: { warehouseId: params.warehouseId, productId: params.productId },
      },
      data: { quantity: params.newQuantity },
    });
  },

  createTransaction(tx: Db, data: Prisma.InventoryTransactionUncheckedCreateInput) {
    return tx.inventoryTransaction.create({ data });
  },

  createAdjustment(tx: Db, data: Prisma.StockAdjustmentUncheckedCreateInput) {
    return tx.stockAdjustment.create({ data });
  },

  createAdjustmentItem(tx: Db, data: Prisma.StockAdjustmentItemUncheckedCreateInput) {
    return tx.stockAdjustmentItem.create({ data });
  },

  findWarehouseForTenant(tenantId: bigint, warehouseId: bigint) {
    return prisma.warehouse.findFirst({ where: { id: warehouseId, tenantId, deletedAt: null } });
  },

  findProductForTenant(tenantId: bigint, productId: bigint) {
    return prisma.product.findFirst({ where: { id: productId, tenantId, deletedAt: null } });
  },
};
