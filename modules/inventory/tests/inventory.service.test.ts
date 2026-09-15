import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/shared/database/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback("outer-tx")),
  },
}));

vi.mock("../repository/inventory.repository", () => ({
  inventoryRepository: {
    listBalancesByTenant: vi.fn(),
    countBalancesByTenant: vi.fn(),
    ensureAndLockBalance: vi.fn(),
    updateBalance: vi.fn(),
    createTransaction: vi.fn(),
    createAdjustment: vi.fn(),
    createAdjustmentItem: vi.fn(),
    findWarehouseForTenant: vi.fn(),
    findProductForTenant: vi.fn(),
    ensureAndLockBatch: vi.fn(),
    updateBatchQuantity: vi.fn(),
    lockBatchById: vi.fn(),
    lockBatchesForFefo: vi.fn(),
    findBatchForTenant: vi.fn(),
  },
}));

vi.mock("@/modules/product/service/product.service", () => ({
  productService: { getManyByIds: vi.fn() },
}));

vi.mock("@/modules/pricing/service/price-list.service", () => ({
  priceListService: { resolveBuyOnePriceMap: vi.fn() },
}));

import { prisma } from "@/shared/database/prisma";
import { inventoryRepository } from "../repository/inventory.repository";
import { productService } from "@/modules/product/service/product.service";
import { priceListService } from "@/modules/pricing/service/price-list.service";
import { inventoryService } from "../service/inventory.service";

describe("inventoryService.recordMovement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies a sufficient outbound movement and writes both the balance update and the ledger row", async () => {
    vi.mocked(inventoryRepository.ensureAndLockBalance).mockResolvedValue(new Prisma.Decimal("10"));

    await inventoryService.recordMovement({
      tenantId: 1n,
      warehouseId: 10n,
      productId: 100n,
      transactionType: "SALE_OUT",
      quantityDelta: "-5",
      referenceType: "SALE",
      referenceId: 555n,
    });

    expect(inventoryRepository.updateBalance).toHaveBeenCalledWith("outer-tx", {
      warehouseId: 10n,
      productId: 100n,
      newQuantity: new Prisma.Decimal("5"),
    });
    expect(inventoryRepository.createTransaction).toHaveBeenCalledWith(
      "outer-tx",
      expect.objectContaining({
        transactionType: "SALE_OUT",
        quantity: new Prisma.Decimal("-5"),
        referenceType: "SALE",
        referenceId: 555n,
      }),
    );
  });

  it("rejects a movement that would take stock below zero", async () => {
    vi.mocked(inventoryRepository.ensureAndLockBalance).mockResolvedValue(new Prisma.Decimal("3"));

    await expect(
      inventoryService.recordMovement({
        tenantId: 1n,
        warehouseId: 10n,
        productId: 100n,
        transactionType: "SALE_OUT",
        quantityDelta: "-5",
        referenceType: "SALE",
        referenceId: 555n,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

    expect(inventoryRepository.updateBalance).not.toHaveBeenCalled();
    expect(inventoryRepository.createTransaction).not.toHaveBeenCalled();
  });

  it("permits going negative when allowNegative is set", async () => {
    vi.mocked(inventoryRepository.ensureAndLockBalance).mockResolvedValue(new Prisma.Decimal("3"));

    await inventoryService.recordMovement({
      tenantId: 1n,
      warehouseId: 10n,
      productId: 100n,
      transactionType: "ADJUSTMENT_OUT",
      quantityDelta: "-5",
      referenceType: "STOCK_ADJUSTMENT",
      referenceId: 1n,
      allowNegative: true,
    });

    expect(inventoryRepository.updateBalance).toHaveBeenCalledWith("outer-tx", {
      warehouseId: 10n,
      productId: 100n,
      newQuantity: new Prisma.Decimal("-2"),
    });
  });

  it("opens its own transaction when the caller doesn't supply one", async () => {
    vi.mocked(inventoryRepository.ensureAndLockBalance).mockResolvedValue(new Prisma.Decimal("0"));

    await inventoryService.recordMovement({
      tenantId: 1n,
      warehouseId: 10n,
      productId: 100n,
      transactionType: "PURCHASE_IN",
      quantityDelta: "10",
      referenceType: "PURCHASE",
      referenceId: 1n,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("reuses the caller's transaction instead of opening a new one", async () => {
    vi.mocked(inventoryRepository.ensureAndLockBalance).mockResolvedValue(new Prisma.Decimal("0"));

    await inventoryService.recordMovement(
      {
        tenantId: 1n,
        warehouseId: 10n,
        productId: 100n,
        transactionType: "PURCHASE_IN",
        quantityDelta: "10",
        referenceType: "PURCHASE",
        referenceId: 1n,
      },
      "caller-tx" as never,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(inventoryRepository.ensureAndLockBalance).toHaveBeenCalledWith(
      "caller-tx",
      1n,
      10n,
      100n,
    );
  });
});

describe("inventoryService — warehouse scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an explicit warehouseId filter outside the caller's scope", async () => {
    await expect(
      inventoryService.listBalances({
        tenantId: 1n,
        warehouseId: 999n,
        scopedWarehouseId: 10n,
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(inventoryRepository.listBalancesByTenant).not.toHaveBeenCalled();
  });

  it("defaults an unfiltered list to the caller's own scoped warehouse", async () => {
    vi.mocked(inventoryRepository.listBalancesByTenant).mockResolvedValue([]);
    vi.mocked(inventoryRepository.countBalancesByTenant).mockResolvedValue(0);

    await inventoryService.listBalances({ tenantId: 1n, scopedWarehouseId: 10n, page: 1, pageSize: 20 });

    expect(inventoryRepository.listBalancesByTenant).toHaveBeenCalledWith(1n, {
      warehouseId: 10n,
      productId: undefined,
      skip: 0,
      take: 20,
    });
    expect(productService.getManyByIds).not.toHaveBeenCalled();
  });

  it("passes a search term through to the repository, for matching a scanned barcode", async () => {
    vi.mocked(inventoryRepository.listBalancesByTenant).mockResolvedValue([]);
    vi.mocked(inventoryRepository.countBalancesByTenant).mockResolvedValue(0);

    await inventoryService.listBalances({
      tenantId: 1n,
      scopedWarehouseId: 10n,
      search: "8901234567890",
      page: 1,
      pageSize: 20,
    });

    expect(inventoryRepository.listBalancesByTenant).toHaveBeenCalledWith(1n, {
      warehouseId: 10n,
      productId: undefined,
      search: "8901234567890",
      skip: 0,
      take: 20,
    });
  });

  it("attaches product details and the per-warehouse buy-1 price to each balance row", async () => {
    vi.mocked(inventoryRepository.listBalancesByTenant).mockResolvedValue([
      { warehouseId: 10n, productId: 100n, quantity: new Prisma.Decimal("5"), updatedAt: new Date("2026-01-01") },
      { warehouseId: 20n, productId: 100n, quantity: new Prisma.Decimal("3"), updatedAt: new Date("2026-01-01") },
    ] as never);
    vi.mocked(inventoryRepository.countBalancesByTenant).mockResolvedValue(2);
    vi.mocked(productService.getManyByIds).mockResolvedValue([
      { id: "100", sku: "SKU-1", name: "Widget", images: [] } as never,
    ]);
    vi.mocked(priceListService.resolveBuyOnePriceMap).mockImplementation(async (_tenantId, warehouseId) =>
      warehouseId === 10n ? new Map([["100", "199.00"]]) : new Map(),
    );

    const result = await inventoryService.listBalances({ tenantId: 1n, scopedWarehouseId: null, page: 1, pageSize: 20 });

    expect(result.items).toEqual([
      expect.objectContaining({ warehouseId: "10", productId: "100", price: "199.00" }),
      expect.objectContaining({ warehouseId: "20", productId: "100", price: null }),
    ]);
    expect(result.items[0].product).toMatchObject({ id: "100", sku: "SKU-1" });
    expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
    expect(priceListService.resolveBuyOnePriceMap).toHaveBeenCalledWith(1n, 10n, [100n]);
    expect(priceListService.resolveBuyOnePriceMap).toHaveBeenCalledWith(1n, 20n, [100n]);
  });

  it("rejects a stock adjustment at a warehouse outside the caller's scope", async () => {
    await expect(
      inventoryService.createStockAdjustment({
        tenantId: 1n,
        warehouseId: 10n,
        reason: "Cycle count",
        items: [{ productId: 100n, quantityDelta: "5" }],
        scopedWarehouseId: 999n,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(inventoryRepository.findWarehouseForTenant).not.toHaveBeenCalled();
  });
});

describe("inventoryService.exportBalances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches every matching row with no skip/take", async () => {
    vi.mocked(inventoryRepository.listBalancesByTenant).mockResolvedValue([]);

    await inventoryService.exportBalances({ tenantId: 1n, scopedWarehouseId: 10n });

    const callArgs = vi.mocked(inventoryRepository.listBalancesByTenant).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(callArgs).toMatchObject({ warehouseId: 10n });
    expect(callArgs.skip).toBeUndefined();
    expect(callArgs.take).toBeUndefined();
    expect(inventoryRepository.countBalancesByTenant).not.toHaveBeenCalled();
  });
});

describe("inventoryService.createStockAdjustment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(inventoryRepository.findWarehouseForTenant).mockResolvedValue({ id: 10n } as never);
    vi.mocked(inventoryRepository.findProductForTenant).mockResolvedValue({ id: 100n } as never);
    // The mock is static (doesn't track a running balance across calls the
    // way the real, transaction-locked row would), so it starts high enough
    // that neither item's delta in the tests below spuriously trips the
    // negative-stock guard — that guard has its own dedicated tests above.
    vi.mocked(inventoryRepository.ensureAndLockBalance).mockResolvedValue(new Prisma.Decimal("100"));
    vi.mocked(inventoryRepository.createAdjustment).mockResolvedValue({
      id: 900n,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);
  });

  it("rejects a warehouse outside the tenant before opening a transaction", async () => {
    vi.mocked(inventoryRepository.findWarehouseForTenant).mockResolvedValue(null);

    await expect(
      inventoryService.createStockAdjustment({
        tenantId: 1n,
        warehouseId: 999n,
        reason: "Cycle count",
        items: [{ productId: 100n, quantityDelta: "5" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a product outside the tenant before opening a transaction", async () => {
    vi.mocked(inventoryRepository.findProductForTenant).mockResolvedValue(null);

    await expect(
      inventoryService.createStockAdjustment({
        tenantId: 1n,
        warehouseId: 10n,
        reason: "Cycle count",
        items: [{ productId: 999n, quantityDelta: "5" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("picks ADJUSTMENT_IN/ADJUSTMENT_OUT per item based on the sign of its delta", async () => {
    await inventoryService.createStockAdjustment({
      tenantId: 1n,
      warehouseId: 10n,
      reason: "Cycle count reconciliation",
      items: [
        { productId: 100n, quantityDelta: "8" },
        { productId: 100n, quantityDelta: "-3" },
      ],
    });

    const transactionTypes = vi
      .mocked(inventoryRepository.createTransaction)
      .mock.calls.map(([, data]) => data.transactionType);
    expect(transactionTypes).toEqual(["ADJUSTMENT_IN", "ADJUSTMENT_OUT"]);
  });

  it("returns the adjustment view with string ids/deltas and links items to STOCK_ADJUSTMENT", async () => {
    const result = await inventoryService.createStockAdjustment({
      tenantId: 1n,
      warehouseId: 10n,
      reason: "Cycle count",
      items: [{ productId: 100n, quantityDelta: "5" }],
    });

    expect(result).toMatchObject({
      id: "900",
      warehouseId: "10",
      reason: "Cycle count",
      items: [{ productId: "100", quantityDelta: "5" }],
    });
    expect(inventoryRepository.createTransaction).toHaveBeenCalledWith(
      "outer-tx",
      expect.objectContaining({ referenceType: "STOCK_ADJUSTMENT", referenceId: 900n }),
    );
  });

  it("requires productBatchId when the product tracks batches", async () => {
    vi.mocked(inventoryRepository.findProductForTenant).mockResolvedValue({ id: 100n, trackBatches: true } as never);

    await expect(
      inventoryService.createStockAdjustment({
        tenantId: 1n,
        warehouseId: 10n,
        reason: "Write off expired stock",
        items: [{ productId: 100n, quantityDelta: "-5" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a productBatchId that doesn't belong to this product/warehouse", async () => {
    vi.mocked(inventoryRepository.findProductForTenant).mockResolvedValue({ id: 100n, trackBatches: true } as never);
    vi.mocked(inventoryRepository.findBatchForTenant).mockResolvedValue(null);

    await expect(
      inventoryService.createStockAdjustment({
        tenantId: 1n,
        warehouseId: 10n,
        reason: "Write off expired stock",
        items: [{ productId: 100n, quantityDelta: "-5", productBatchId: 500n }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("passes productBatchId through to the adjustment item and the movement when valid", async () => {
    vi.mocked(inventoryRepository.findProductForTenant).mockResolvedValue({ id: 100n, trackBatches: true } as never);
    vi.mocked(inventoryRepository.findBatchForTenant).mockResolvedValue({ id: 500n } as never);
    vi.mocked(inventoryRepository.lockBatchById).mockResolvedValue(new Prisma.Decimal("20"));

    await inventoryService.createStockAdjustment({
      tenantId: 1n,
      warehouseId: 10n,
      reason: "Write off expired stock",
      items: [{ productId: 100n, quantityDelta: "-5", productBatchId: 500n }],
    });

    expect(inventoryRepository.createAdjustmentItem).toHaveBeenCalledWith(
      "outer-tx",
      expect.objectContaining({ productBatchId: 500n }),
    );
    expect(inventoryRepository.updateBatchQuantity).toHaveBeenCalledWith("outer-tx", 500n, new Prisma.Decimal("15"));
    expect(inventoryRepository.createTransaction).toHaveBeenCalledWith(
      "outer-tx",
      expect.objectContaining({ productBatchId: 500n }),
    );
  });
});

describe("inventoryService.recordMovement — batch sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the batch quantity in lockstep with the aggregate balance", async () => {
    vi.mocked(inventoryRepository.ensureAndLockBalance).mockResolvedValue(new Prisma.Decimal("50"));
    vi.mocked(inventoryRepository.lockBatchById).mockResolvedValue(new Prisma.Decimal("10"));

    await inventoryService.recordMovement({
      tenantId: 1n,
      warehouseId: 10n,
      productId: 100n,
      transactionType: "SALE_OUT",
      quantityDelta: "-4",
      referenceType: "SALE",
      referenceId: 1n,
      productBatchId: 500n,
    });

    expect(inventoryRepository.updateBatchQuantity).toHaveBeenCalledWith("outer-tx", 500n, new Prisma.Decimal("6"));
    expect(inventoryRepository.createTransaction).toHaveBeenCalledWith(
      "outer-tx",
      expect.objectContaining({ productBatchId: 500n }),
    );
  });

  it("blocks a movement that would take a specific batch below zero, even if the aggregate has room", async () => {
    vi.mocked(inventoryRepository.ensureAndLockBalance).mockResolvedValue(new Prisma.Decimal("500"));
    vi.mocked(inventoryRepository.lockBatchById).mockResolvedValue(new Prisma.Decimal("3"));

    await expect(
      inventoryService.recordMovement({
        tenantId: 1n,
        warehouseId: 10n,
        productId: 100n,
        transactionType: "SALE_OUT",
        quantityDelta: "-4",
        referenceType: "SALE",
        referenceId: 1n,
        productBatchId: 500n,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

    expect(inventoryRepository.updateBatchQuantity).not.toHaveBeenCalled();
  });

  it("never touches ProductBatch when productBatchId is omitted", async () => {
    vi.mocked(inventoryRepository.ensureAndLockBalance).mockResolvedValue(new Prisma.Decimal("50"));

    await inventoryService.recordMovement({
      tenantId: 1n,
      warehouseId: 10n,
      productId: 100n,
      transactionType: "SALE_OUT",
      quantityDelta: "-4",
      referenceType: "SALE",
      referenceId: 1n,
    });

    expect(inventoryRepository.lockBatchById).not.toHaveBeenCalled();
    expect(inventoryRepository.updateBatchQuantity).not.toHaveBeenCalled();
  });
});

describe("inventoryService.resolveFefoBatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("picks the soonest-expiring batch(es) first until the needed quantity is covered", async () => {
    vi.mocked(inventoryRepository.lockBatchesForFefo).mockResolvedValue([
      { id: 1n, quantity: new Prisma.Decimal("5") },
      { id: 2n, quantity: new Prisma.Decimal("10") },
      { id: 3n, quantity: new Prisma.Decimal("10") },
    ]);

    const picks = await inventoryService.resolveFefoBatches("tx" as never, 10n, 100n, "8");

    expect(picks).toEqual([
      { productBatchId: 1n, quantity: "5" },
      { productBatchId: 2n, quantity: "3" },
    ]);
  });

  it("draws from exactly one batch when it fully covers the need", async () => {
    vi.mocked(inventoryRepository.lockBatchesForFefo).mockResolvedValue([
      { id: 1n, quantity: new Prisma.Decimal("20") },
    ]);

    const picks = await inventoryService.resolveFefoBatches("tx" as never, 10n, 100n, "8");

    expect(picks).toEqual([{ productBatchId: 1n, quantity: "8" }]);
  });

  it("throws INSUFFICIENT_STOCK when every batch combined can't cover the need", async () => {
    vi.mocked(inventoryRepository.lockBatchesForFefo).mockResolvedValue([
      { id: 1n, quantity: new Prisma.Decimal("2") },
      { id: 2n, quantity: new Prisma.Decimal("3") },
    ]);

    await expect(inventoryService.resolveFefoBatches("tx" as never, 10n, 100n, "8")).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
    });
  });

  it("returns nothing when quantityNeeded is already zero", async () => {
    vi.mocked(inventoryRepository.lockBatchesForFefo).mockResolvedValue([
      { id: 1n, quantity: new Prisma.Decimal("5") },
    ]);

    const picks = await inventoryService.resolveFefoBatches("tx" as never, 10n, 100n, "0");

    expect(picks).toEqual([]);
  });
});

describe("inventoryService.ensureBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to ensureAndLockBatch and returns just the id", async () => {
    vi.mocked(inventoryRepository.ensureAndLockBatch).mockResolvedValue({
      id: 42n,
      quantity: new Prisma.Decimal("0"),
    });

    const result = await inventoryService.ensureBatch(
      {
        tenantId: 1n,
        warehouseId: 10n,
        productId: 100n,
        batchNumber: "LOT-001",
        expiryDate: new Date("2027-01-01"),
        costPrice: "50.00",
      },
      "tx" as never,
    );

    expect(result).toEqual({ id: 42n });
    expect(inventoryRepository.ensureAndLockBatch).toHaveBeenCalledWith(
      "tx",
      1n,
      10n,
      100n,
      "LOT-001",
      new Date("2027-01-01"),
      null,
      new Prisma.Decimal("50.00"),
    );
  });
});
