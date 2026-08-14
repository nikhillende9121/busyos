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
    ensureAndLockBalance: vi.fn(),
    updateBalance: vi.fn(),
    createTransaction: vi.fn(),
    createAdjustment: vi.fn(),
    createAdjustmentItem: vi.fn(),
    findWarehouseForTenant: vi.fn(),
    findProductForTenant: vi.fn(),
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
      inventoryService.listBalances({ tenantId: 1n, warehouseId: 999n, scopedWarehouseId: 10n }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(inventoryRepository.listBalancesByTenant).not.toHaveBeenCalled();
  });

  it("defaults an unfiltered list to the caller's own scoped warehouse", async () => {
    vi.mocked(inventoryRepository.listBalancesByTenant).mockResolvedValue([]);

    await inventoryService.listBalances({ tenantId: 1n, scopedWarehouseId: 10n });

    expect(inventoryRepository.listBalancesByTenant).toHaveBeenCalledWith(1n, {
      warehouseId: 10n,
      productId: undefined,
    });
    expect(productService.getManyByIds).not.toHaveBeenCalled();
  });

  it("passes a search term through to the repository, for matching a scanned barcode", async () => {
    vi.mocked(inventoryRepository.listBalancesByTenant).mockResolvedValue([]);

    await inventoryService.listBalances({ tenantId: 1n, scopedWarehouseId: 10n, search: "8901234567890" });

    expect(inventoryRepository.listBalancesByTenant).toHaveBeenCalledWith(1n, {
      warehouseId: 10n,
      productId: undefined,
      search: "8901234567890",
    });
  });

  it("attaches product details and the per-warehouse buy-1 price to each balance row", async () => {
    vi.mocked(inventoryRepository.listBalancesByTenant).mockResolvedValue([
      { warehouseId: 10n, productId: 100n, quantity: new Prisma.Decimal("5"), updatedAt: new Date("2026-01-01") },
      { warehouseId: 20n, productId: 100n, quantity: new Prisma.Decimal("3"), updatedAt: new Date("2026-01-01") },
    ] as never);
    vi.mocked(productService.getManyByIds).mockResolvedValue([
      { id: "100", sku: "SKU-1", name: "Widget", images: [] } as never,
    ]);
    vi.mocked(priceListService.resolveBuyOnePriceMap).mockImplementation(async (_tenantId, warehouseId) =>
      warehouseId === 10n ? new Map([["100", "199.00"]]) : new Map(),
    );

    const result = await inventoryService.listBalances({ tenantId: 1n, scopedWarehouseId: null });

    expect(result).toEqual([
      expect.objectContaining({ warehouseId: "10", productId: "100", price: "199.00" }),
      expect.objectContaining({ warehouseId: "20", productId: "100", price: null }),
    ]);
    expect(result[0].product).toMatchObject({ id: "100", sku: "SKU-1" });
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
});
