import { Prisma } from "@prisma/client";
import type { InventoryTransactionType } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import { inventoryRepository } from "../repository/inventory.repository";
import { AppError } from "@/shared/errors/app-error";
import { assertWarehouseAccess } from "@/shared/utils/assert-warehouse-access";
import { productService } from "@/modules/product/service/product.service";
import { priceListService } from "@/modules/pricing/service/price-list.service";
import type { ProductView } from "@/modules/product/types/product.types";
import type {
  BalanceFilterDto,
  CreateStockAdjustmentDto,
  RecordMovementDto,
} from "../dto/inventory.dto";
import type { InventoryBalanceView, StockAdjustmentView } from "../types/inventory.types";

export const inventoryService = {
  // A scoped caller who also passes an explicit warehouseId filter must be
  // asking about their own store (assert, don't silently override); one
  // who passes none is forced to their own store rather than seeing every
  // warehouse's stock by default.
  async listBalances(filter: BalanceFilterDto): Promise<InventoryBalanceView[]> {
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
    if (balances.length === 0) return [];

    const productIds = [...new Set(balances.map((balance) => balance.productId.toString()))].map(BigInt);
    const products = await productService.getManyByIds(filter.tenantId, productIds);
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
      const priceMap = await priceListService.resolveBuyOnePriceMap(
        filter.tenantId,
        BigInt(warehouseKey),
        warehouseProductIds,
      );
      for (const [productId, price] of priceMap) {
        priceByWarehouseAndProduct.set(`${warehouseKey}:${productId}`, price);
      }
    }

    return balances.map((balance) =>
      toBalanceView(balance, productById, priceByWarehouseAndProduct),
    );
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
      await inventoryRepository.createTransaction(client, {
        tenantId: dto.tenantId,
        warehouseId: dto.warehouseId,
        productId: dto.productId,
        transactionType: dto.transactionType,
        quantity: delta,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        createdBy: dto.createdBy,
      });
    };

    if (tx) {
      await run(tx);
    } else {
      await prisma.$transaction((client) => run(client));
    }
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
