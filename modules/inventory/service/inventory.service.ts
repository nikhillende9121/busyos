import { Prisma } from "@prisma/client";
import type { InventoryTransactionType } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import { inventoryRepository } from "../repository/inventory.repository";
import { AppError } from "@/shared/errors/app-error";
import { assertWarehouseAccess } from "@/shared/utils/assert-warehouse-access";
import { productService } from "@/modules/product/service/product.service";
import { priceListService } from "@/modules/pricing/service/price-list.service";
import { buildPagination, type Paginated } from "@/shared/utils/pagination";
import type { ProductView } from "@/modules/product/types/product.types";
import type {
  BalanceFilterDto,
  BalanceExportDto,
  CreateStockAdjustmentDto,
  EnsureBatchDto,
  RecordMovementDto,
} from "../dto/inventory.dto";
import type { InventoryBalanceView, StockAdjustmentView } from "../types/inventory.types";

type BalanceRow = Awaited<ReturnType<typeof inventoryRepository.listBalancesByTenant>>[number];

// Shared by listBalances() and exportBalances(): each row is priced/named
// independently (no running total across rows), so enriching a page or the
// full export works identically — just a different upstream row set.
async function enrichBalances(tenantId: bigint, balances: BalanceRow[]): Promise<InventoryBalanceView[]> {
  if (balances.length === 0) return [];

  const productIds = [...new Set(balances.map((balance) => balance.productId.toString()))].map(BigInt);
  const products = await productService.getManyByIds(tenantId, productIds);
  const productById = new Map(products.map((product) => [product.id, product]));

  // Price is per (warehouseId, productId) — group so a caller viewing
  // every warehouse at once still gets each row priced against its own
  // warehouse, not whichever warehouse happened to be resolved first.
  const productIdsByWarehouse = new Map<string, bigint[]>();
  for (const balance of balances) {
    const warehouseKey = balance.warehouseId.toString();
    const existing = productIdsByWarehouse.get(warehouseKey);
    if (existing) {
      existing.push(balance.productId);
    } else {
      productIdsByWarehouse.set(warehouseKey, [balance.productId]);
    }
  }
  const priceByWarehouseAndProduct = new Map<string, string>();
  for (const [warehouseKey, warehouseProductIds] of productIdsByWarehouse) {
    const priceMap = await priceListService.resolveBuyOnePriceMap(tenantId, BigInt(warehouseKey), warehouseProductIds);
    for (const [productId, price] of priceMap) {
      priceByWarehouseAndProduct.set(`${warehouseKey}:${productId}`, price);
    }
  }

  return balances.map((balance) => toBalanceView(balance, productById, priceByWarehouseAndProduct));
}

export const inventoryService = {
  // A scoped caller who also passes an explicit warehouseId filter must be
  // asking about their own store (assert, don't silently override); one
  // who passes none is forced to their own store rather than seeing every
  // warehouse's stock by default.
  async listBalances(filter: BalanceFilterDto): Promise<Paginated<InventoryBalanceView>> {
    const scopedWarehouseId = filter.scopedWarehouseId ?? null;
    if (filter.warehouseId !== undefined) {
      assertWarehouseAccess({ warehouseId: scopedWarehouseId }, filter.warehouseId);
    }
    const effectiveWarehouseId = filter.warehouseId ?? scopedWarehouseId ?? undefined;
    const repoFilter = {
      warehouseId: effectiveWarehouseId,
      productId: filter.productId,
      search: filter.search,
    };

    const skip = (filter.page - 1) * filter.pageSize;
    const [balances, total] = await Promise.all([
      inventoryRepository.listBalancesByTenant(filter.tenantId, { ...repoFilter, skip, take: filter.pageSize }),
      inventoryRepository.countBalancesByTenant(filter.tenantId, repoFilter),
    ]);

    return {
      items: await enrichBalances(filter.tenantId, balances),
      pagination: buildPagination(filter.page, filter.pageSize, total),
    };
  },

  // Same filter as listBalances(), but every matching row — no
  // page/pageSize — for GET /inventory/balance/export.
  async exportBalances(filter: BalanceExportDto): Promise<InventoryBalanceView[]> {
    const scopedWarehouseId = filter.scopedWarehouseId ?? null;
    if (filter.warehouseId !== undefined) {
      assertWarehouseAccess({ warehouseId: scopedWarehouseId }, filter.warehouseId);
    }
    const effectiveWarehouseId = filter.warehouseId ?? scopedWarehouseId ?? undefined;

    const balances = await inventoryRepository.listBalancesByTenant(filter.tenantId, {
      warehouseId: effectiveWarehouseId,
      productId: filter.productId,
      search: filter.search,
    });
    return enrichBalances(filter.tenantId, balances);
  },

  // The module's public API for moving stock — see MODULE_GUIDE.md: other
  // modules (purchase receiving, sale confirmation, transfers, none built
  // yet) call this, never inventoryRepository directly. Composable with a
  // caller's own transaction via `tx` (so e.g. a purchase's item writes and
  // its resulting inventory movement commit or roll back together, per
  // DATABASE.md -> Transaction Rules); opens its own transaction otherwise.
  async recordMovement(dto: RecordMovementDto, tx?: Db): Promise<void> {
    const run = async (client: Db) => {
      const currentQuantity = await inventoryRepository.ensureAndLockBalance(
        client,
        dto.tenantId,
        dto.warehouseId,
        dto.productId,
      );
      const delta = new Prisma.Decimal(dto.quantityDelta);
      const newQuantity = currentQuantity.add(delta);

      if (newQuantity.isNegative() && !dto.allowNegative) {
        throw new AppError(
          "INSUFFICIENT_STOCK",
          "This movement would take stock below zero",
        );
      }

      await inventoryRepository.updateBalance(client, {
        warehouseId: dto.warehouseId,
        productId: dto.productId,
        newQuantity,
      });

      // Kept in lockstep with the aggregate balance above, in this same
      // transaction — see Docs/batch_expiry_tracking_plan.md §2/§7.
      // Callers of a non-batch-tracked product never pass productBatchId,
      // so this block simply never runs for them.
      if (dto.productBatchId) {
        const currentBatchQuantity = await inventoryRepository.lockBatchById(client, dto.productBatchId);
        const newBatchQuantity = currentBatchQuantity.add(delta);
        if (newBatchQuantity.isNegative() && !dto.allowNegative) {
          throw new AppError("INSUFFICIENT_STOCK", "This movement would take this batch below zero");
        }
        await inventoryRepository.updateBatchQuantity(client, dto.productBatchId, newBatchQuantity);
      }

      await inventoryRepository.createTransaction(client, {
        tenantId: dto.tenantId,
        warehouseId: dto.warehouseId,
        productId: dto.productId,
        transactionType: dto.transactionType,
        quantity: delta,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        createdBy: dto.createdBy,
        productBatchId: dto.productBatchId,
      });
    };

    if (tx) {
      await run(tx);
    } else {
      await prisma.$transaction((client) => run(client));
    }
  },

  // Cross-module ownership check for a user-supplied batch id — used by
  // purchase-return.service.ts (§10) so a return line's chosen batch is
  // validated the same "findXForTenant" way every other cross-entity id
  // is validated in this codebase, without purchase-return reaching into
  // inventoryRepository directly (module boundary — see MODULE_GUIDE.md).
  findBatchForTenant(tenantId: bigint, warehouseId: bigint, productId: bigint, batchId: bigint) {
    return inventoryRepository.findBatchForTenant(tenantId, warehouseId, productId, batchId);
  },

  // Only ever called from purchase.service.ts's receive() — a batch is
  // born (or found again, for a repeat receipt of the same batch number)
  // here, then immediately fed into recordMovement's productBatchId by
  // the caller. See Docs/batch_expiry_tracking_plan.md §8.
  async ensureBatch(dto: EnsureBatchDto, tx: Db): Promise<{ id: bigint }> {
    const batch = await inventoryRepository.ensureAndLockBatch(
      tx,
      dto.tenantId,
      dto.warehouseId,
      dto.productId,
      dto.batchNumber,
      dto.expiryDate ?? null,
      dto.manufacturedDate ?? null,
      dto.costPrice ? new Prisma.Decimal(dto.costPrice) : null,
    );
    return { id: batch.id };
  },

  // FEFO (first-expiry-first-out) pick for a batch-tracked product —
  // locks every candidate batch together (so two concurrent sales can't
  // both read the same pre-lock snapshot), then draws soonest-expiring
  // first until quantityNeeded is covered. Throws the same
  // INSUFFICIENT_STOCK a non-batch-tracked product's plain recordMovement
  // already throws when the aggregate can't cover a sale. Callers apply
  // each pick via recordMovement's productBatchId, inside the same
  // transaction this locked under. See
  // Docs/batch_expiry_tracking_plan.md §7/§9.
  async resolveFefoBatches(
    tx: Db,
    warehouseId: bigint,
    productId: bigint,
    quantityNeeded: string,
  ): Promise<{ productBatchId: bigint; quantity: string }[]> {
    const candidates = await inventoryRepository.lockBatchesForFefo(tx, warehouseId, productId);
    let remaining = new Prisma.Decimal(quantityNeeded);
    const picks: { productBatchId: bigint; quantity: string }[] = [];
    for (const batch of candidates) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const take = Prisma.Decimal.min(batch.quantity, remaining);
      picks.push({ productBatchId: batch.id, quantity: take.toString() });
      remaining = remaining.sub(take);
    }
    if (remaining.greaterThan(0)) {
      throw new AppError("INSUFFICIENT_STOCK", "Not enough batch stock available to cover this quantity");
    }
    return picks;
  },

  async createStockAdjustment(dto: CreateStockAdjustmentDto): Promise<StockAdjustmentView> {
    assertWarehouseAccess({ warehouseId: dto.scopedWarehouseId ?? null }, dto.warehouseId);

    const warehouse = await inventoryRepository.findWarehouseForTenant(dto.tenantId, dto.warehouseId);
    if (!warehouse) {
      throw new AppError("VALIDATION_ERROR", "warehouseId does not belong to this tenant");
    }
    for (const item of dto.items) {
      const product = await inventoryRepository.findProductForTenant(dto.tenantId, item.productId);
      if (!product) {
        throw new AppError(
          "VALIDATION_ERROR",
          `productId ${item.productId.toString()} does not belong to this tenant`,
        );
      }
      // A batch-tracked product's write-off/adjustment must target one
      // exact batch (e.g. clearing expired stock) — see
      // Docs/batch_expiry_tracking_plan.md §10/§12.
      if (product.trackBatches) {
        if (!item.productBatchId) {
          throw new AppError(
            "VALIDATION_ERROR",
            `productId ${item.productId.toString()} tracks batches — productBatchId is required`,
          );
        }
        const batch = await inventoryRepository.findBatchForTenant(
          dto.tenantId,
          dto.warehouseId,
          item.productId,
          item.productBatchId,
        );
        if (!batch) {
          throw new AppError("VALIDATION_ERROR", "productBatchId does not belong to this product/warehouse");
        }
      }
    }

    return prisma.$transaction(async (tx) => {
      const adjustment = await inventoryRepository.createAdjustment(tx, {
        tenantId: dto.tenantId,
        warehouseId: dto.warehouseId,
        reason: dto.reason,
        createdBy: dto.createdBy,
      });

      for (const item of dto.items) {
        await inventoryRepository.createAdjustmentItem(tx, {
          adjustmentId: adjustment.id,
          productId: item.productId,
          quantity: new Prisma.Decimal(item.quantityDelta),
          productBatchId: item.productBatchId,
        });

        await inventoryService.recordMovement(
          {
            tenantId: dto.tenantId,
            warehouseId: dto.warehouseId,
            productId: item.productId,
            transactionType: pickAdjustmentTransactionType(item.quantityDelta),
            quantityDelta: item.quantityDelta,
            referenceType: "STOCK_ADJUSTMENT",
            referenceId: adjustment.id,
            createdBy: dto.createdBy,
            productBatchId: item.productBatchId,
          },
          tx,
        );
      }

      return {
        id: adjustment.id.toString(),
        warehouseId: dto.warehouseId.toString(),
        reason: dto.reason,
        items: dto.items.map((item) => ({
          productId: item.productId.toString(),
          quantityDelta: item.quantityDelta,
          productBatchId: item.productBatchId?.toString() ?? null,
        })),
        createdAt: adjustment.createdAt.toISOString(),
      };
    });
  },
};

function pickAdjustmentTransactionType(quantityDelta: string): InventoryTransactionType {
  return Number(quantityDelta) >= 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";
}

function toBalanceView(
  balance: { warehouseId: bigint; productId: bigint; quantity: Prisma.Decimal; updatedAt: Date },
  productById: Map<string, ProductView>,
  priceByWarehouseAndProduct: Map<string, string>,
): InventoryBalanceView {
  const warehouseId = balance.warehouseId.toString();
  const productId = balance.productId.toString();
  return {
    warehouseId,
    productId,
    quantity: balance.quantity.toString(),
    updatedAt: balance.updatedAt.toISOString(),
    product: productById.get(productId) ?? null,
    price: priceByWarehouseAndProduct.get(`${warehouseId}:${productId}`) ?? null,
  };
}
