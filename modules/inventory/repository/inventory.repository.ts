import { Prisma } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";

type BalanceFilter = {
  warehouseId?: bigint;
  productId?: bigint;
  // Matches the product's name, SKU, or barcode — a barcode scan sends the
  // scanned code through this same param, so barcode must be an exact
  // "contains" match candidate alongside name/sku, not just a prefix.
  search?: string;
};

function whereClause(tenantId: bigint, filter: BalanceFilter): Prisma.InventoryBalanceWhereInput {
  return {
    tenantId,
    ...(filter.warehouseId !== undefined ? { warehouseId: filter.warehouseId } : {}),
    ...(filter.productId !== undefined ? { productId: filter.productId } : {}),
    ...(filter.search
      ? {
          product: {
            OR: [
              { name: { contains: filter.search } },
              { sku: { contains: filter.search } },
              { barcode: { contains: filter.search } },
            ],
          },
        }
      : {}),
  };
}

export const inventoryRepository = {
  // skip/take both optional — omitted entirely means "every matching row,"
  // which is what exportBalances() wants; listBalances() always supplies
  // both.
  listBalancesByTenant(tenantId: bigint, filter: BalanceFilter & { skip?: number; take?: number }) {
    return prisma.inventoryBalance.findMany({
      where: whereClause(tenantId, filter),
      orderBy: [{ warehouseId: "asc" }, { productId: "asc" }],
      ...(filter.skip !== undefined ? { skip: filter.skip } : {}),
      ...(filter.take !== undefined ? { take: filter.take } : {}),
    });
  },

  countBalancesByTenant(tenantId: bigint, filter: BalanceFilter) {
    return prisma.inventoryBalance.count({ where: whereClause(tenantId, filter) });
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

  // Cross-entity ownership check for a user-supplied batch id (stock
  // adjustment target, purchase-return line) — the batch must actually be
  // this tenant's, at this warehouse, for this product, same "findXForTenant"
  // pattern used everywhere else in this codebase.
  findBatchForTenant(tenantId: bigint, warehouseId: bigint, productId: bigint, batchId: bigint) {
    return prisma.productBatch.findFirst({ where: { id: batchId, tenantId, warehouseId, productId } });
  },

  // Same two-statement "ensure row exists, then lock it" shape as
  // ensureAndLockBalance above, one level deeper (warehouse+product+batch
  // number instead of just warehouse+product) — see
  // Docs/batch_expiry_tracking_plan.md §7. expiryDate/manufacturedDate/
  // costPrice are only ever written on first insert (ON DUPLICATE KEY
  // UPDATE quantity = quantity leaves them untouched on a repeat receipt
  // of the same batch number) — a mismatched re-receipt is a data-entry
  // problem this doesn't try to reconcile.
  async ensureAndLockBatch(
    tx: Db,
    tenantId: bigint,
    warehouseId: bigint,
    productId: bigint,
    batchNumber: string,
    expiryDate: Date | null,
    manufacturedDate: Date | null,
    costPrice: Prisma.Decimal | null,
  ): Promise<{ id: bigint; quantity: Prisma.Decimal }> {
    await tx.$executeRaw`
      INSERT INTO product_batches (tenantId, warehouseId, productId, batchNumber, expiryDate, manufacturedDate, costPrice, quantity, createdAt, updatedAt)
      VALUES (${tenantId}, ${warehouseId}, ${productId}, ${batchNumber}, ${expiryDate}, ${manufacturedDate}, ${costPrice}, 0, NOW(), NOW())
      ON DUPLICATE KEY UPDATE quantity = quantity
    `;
    const rows = await tx.$queryRaw<{ id: unknown; quantity: unknown }[]>`
      SELECT id, quantity FROM product_batches
      WHERE warehouseId = ${warehouseId} AND productId = ${productId} AND batchNumber = ${batchNumber}
      FOR UPDATE
    `;
    const row = rows[0];
    return { id: BigInt(row.id as string | number | bigint), quantity: new Prisma.Decimal(row.quantity as Prisma.Decimal.Value) };
  },

  updateBatchQuantity(tx: Db, batchId: bigint, newQuantity: Prisma.Decimal) {
    return tx.productBatch.update({ where: { id: batchId }, data: { quantity: newQuantity } });
  },

  // Single-row lock by primary key — used by recordMovement itself so it
  // stays self-contained (same reasoning as ensureAndLockBalance: never
  // trust a pre-fetched quantity from before the transaction/lock, always
  // re-read under lock here even though a caller like resolveFefoBatches
  // already knows the batch and an approximate quantity).
  async lockBatchById(tx: Db, batchId: bigint): Promise<Prisma.Decimal> {
    const rows = await tx.$queryRaw<{ quantity: unknown }[]>`
      SELECT quantity FROM product_batches WHERE id = ${batchId} FOR UPDATE
    `;
    return new Prisma.Decimal(rows[0].quantity as Prisma.Decimal.Value);
  },

  // Locks every candidate batch for a (warehouse, product) together,
  // soonest-expiring first (batches with no expiryDate sort last — an
  // unset expiry is not "expires soonest") — the multi-row lock
  // resolveFefoBatches (product-batch.service.ts) needs so two concurrent
  // sales can't both read the same pre-lock snapshot and over-sell a
  // batch. See Docs/batch_expiry_tracking_plan.md §7/§9.
  async lockBatchesForFefo(
    tx: Db,
    warehouseId: bigint,
    productId: bigint,
  ): Promise<{ id: bigint; quantity: Prisma.Decimal }[]> {
    const rows = await tx.$queryRaw<{ id: unknown; quantity: unknown }[]>`
      SELECT id, quantity FROM product_batches
      WHERE warehouseId = ${warehouseId} AND productId = ${productId} AND quantity > 0
      ORDER BY expiryDate IS NULL, expiryDate ASC
      FOR UPDATE
    `;
    return rows.map((row) => ({
      id: BigInt(row.id as string | number | bigint),
      quantity: new Prisma.Decimal(row.quantity as Prisma.Decimal.Value),
    }));
  },
};
