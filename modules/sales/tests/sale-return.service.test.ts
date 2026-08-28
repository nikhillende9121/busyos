import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/shared/database/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback("sale-return-tx")),
  },
}));

vi.mock("../repository/sale-return.repository", () => ({
  saleReturnRepository: {
    findManyByTenant: vi.fn(),
    findByIdForTenant: vi.fn(),
    findSaleForTenant: vi.fn(),
    create: vi.fn(),
    createItem: vi.fn(),
    updateItemReturnedQuantity: vi.fn(),
  },
}));

vi.mock("@/modules/inventory/service/inventory.service", () => ({
  inventoryService: {
    recordMovement: vi.fn(),
  },
}));

import { saleReturnRepository } from "../repository/sale-return.repository";
import { inventoryService } from "@/modules/inventory/service/inventory.service";
import { saleReturnService } from "../service/sale-return.service";

function saleItemRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 900n,
    saleId: 800n,
    productId: 100n,
    quantity: new Prisma.Decimal("30"),
    returnedQuantity: new Prisma.Decimal("0"),
    price: new Prisma.Decimal("80"),
    tax: new Prisma.Decimal("0"),
    ...overrides,
  };
}

function saleRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 800n,
    tenantId: 1n,
    warehouseId: 10n,
    status: "CONFIRMED",
    items: [saleItemRow()],
    discounts: [] as { saleItemId: bigint | null; amount: Prisma.Decimal }[],
    ...overrides,
  };
}

describe("saleReturnService — warehouse scoping", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(saleReturnRepository.create).mockResolvedValue({ id: 1100n, saleId: 800n, reason: "x", createdAt: new Date() } as never);
    vi.mocked(saleReturnRepository.createItem).mockImplementation(
      (async (_tx: unknown, data: Record<string, unknown>) => ({ id: 1200n, ...data })) as never,
    );
  });

  it("rejects returning a sale outside the caller's scoped warehouse", async () => {
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(saleRow({ warehouseId: 10n }) as never);

    await expect(
      saleReturnService.create({
        tenantId: 1n,
        saleId: 800n,
        reason: "x",
        items: [{ saleItemId: 900n, quantity: "5" }],
        scopedWarehouseId: 999n,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("filters list() by the caller's scoped warehouse", async () => {
    vi.mocked(saleReturnRepository.findManyByTenant).mockResolvedValue([]);

    await saleReturnService.list(1n, undefined, 10n);

    expect(saleReturnRepository.findManyByTenant).toHaveBeenCalledWith(1n, { saleId: undefined, warehouseId: 10n });
  });
});

describe("saleReturnService.create", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(saleReturnRepository.create).mockResolvedValue({
      id: 1100n,
      saleId: 800n,
      reason: "Customer changed mind",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: null,
    } as never);
    vi.mocked(saleReturnRepository.createItem).mockImplementation(
      (async (_tx: unknown, data: Record<string, unknown>) => ({ id: 1200n, ...data })) as never,
    );
  });

  it("rejects a sale outside the tenant", async () => {
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(null);

    await expect(
      saleReturnService.create({
        tenantId: 1n,
        saleId: 999n,
        reason: "Customer changed mind",
        items: [{ saleItemId: 900n, quantity: "5" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(saleReturnRepository.create).not.toHaveBeenCalled();
  });

  it("rejects returning from a sale that never had stock decremented (DRAFT)", async () => {
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(
      saleRow({ status: "DRAFT" }) as never,
    );

    await expect(
      saleReturnService.create({
        tenantId: 1n,
        saleId: 800n,
        reason: "Customer changed mind",
        items: [{ saleItemId: 900n, quantity: "5" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(saleReturnRepository.create).not.toHaveBeenCalled();
  });

  it("rejects returning from an already-cancelled sale", async () => {
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(
      saleRow({ status: "CANCELLED" }) as never,
    );

    await expect(
      saleReturnService.create({
        tenantId: 1n,
        saleId: 800n,
        reason: "Customer changed mind",
        items: [{ saleItemId: 900n, quantity: "5" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects returning more than was sold on the line", async () => {
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(saleRow() as never);

    await expect(
      saleReturnService.create({
        tenantId: 1n,
        saleId: 800n,
        reason: "Customer changed mind",
        items: [{ saleItemId: 900n, quantity: "31" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refunds at full list price when the sale had no discounts", async () => {
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(saleRow() as never);

    const result = await saleReturnService.create({
      tenantId: 1n,
      saleId: 800n,
      reason: "Customer changed mind",
      items: [{ saleItemId: 900n, quantity: "5" }],
    });

    expect(result).toMatchObject({
      saleId: "800",
      reason: "Customer changed mind",
      items: [{ saleItemId: "900", productId: "100", quantity: "5", refundAmount: "400" }],
      totalRefundAmount: "400",
    });
    expect(saleReturnRepository.updateItemReturnedQuantity).toHaveBeenCalledWith(
      "sale-return-tx",
      900n,
      new Prisma.Decimal("5"),
    );
    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: 10n,
        productId: 100n,
        transactionType: "SALE_RETURN_IN",
        quantityDelta: "5",
        referenceType: "SALE_RETURN",
        referenceId: 1100n,
      }),
      "sale-return-tx",
    );
  });

  it("prorates a line-level discount into the refund", async () => {
    // 30 units @ 80 = 2400 subtotal, a 240 line-level discount -> effective
    // unit price (2400 - 240) / 30 = 72; returning 5 units refunds 360.
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(
      saleRow({ discounts: [{ saleItemId: 900n, amount: new Prisma.Decimal("240") }] }) as never,
    );

    const result = await saleReturnService.create({
      tenantId: 1n,
      saleId: 800n,
      reason: "Customer changed mind",
      items: [{ saleItemId: 900n, quantity: "5" }],
    });

    expect(result.items[0].refundAmount).toBe("360");
  });

  it("apportions an order-level coupon discount across lines by subtotal share", async () => {
    // Two lines: 30@80=2400 and 10@100=1000, subtotal 3400. An order-level
    // coupon of 340 apportions 30/34 = 300 to line A, 40 to line B (10%
    // each, since the coupon is 10% of the whole order in this example).
    const lineB = saleItemRow({ id: 901n, productId: 200n, quantity: new Prisma.Decimal("10"), price: new Prisma.Decimal("100") });
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(
      saleRow({
        items: [saleItemRow(), lineB],
        discounts: [{ saleItemId: null, amount: new Prisma.Decimal("340") }],
      }) as never,
    );

    const result = await saleReturnService.create({
      tenantId: 1n,
      saleId: 800n,
      reason: "Customer changed mind",
      items: [{ saleItemId: 900n, quantity: "3" }],
    });

    // line A subtotal 2400, share of order discount = 340 * 2400/3400 = 240
    // effective unit price = (2400 - 240) / 30 = 72; refund for 3 units = 216
    expect(result.items[0].refundAmount).toBe("216");
  });

  it("allows a COMPLETED sale to be returned from too", async () => {
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(
      saleRow({ status: "COMPLETED" }) as never,
    );

    await expect(
      saleReturnService.create({
        tenantId: 1n,
        saleId: 800n,
        reason: "Damaged in use",
        items: [{ saleItemId: 900n, quantity: "5" }],
      }),
    ).resolves.toMatchObject({ saleId: "800" });
  });
});

describe("saleReturnService.quote", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("computes the same refund as create(), without writing anything", async () => {
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(
      saleRow({ discounts: [{ saleItemId: 900n, amount: new Prisma.Decimal("240") }] }) as never,
    );

    const result = await saleReturnService.quote({
      tenantId: 1n,
      saleId: 800n,
      items: [{ saleItemId: 900n, quantity: "5" }],
    });

    expect(result).toEqual({
      items: [{ saleItemId: "900", productId: "100", quantity: "5", refundAmount: "360" }],
      totalRefundAmount: "360",
    });
    expect(saleReturnRepository.create).not.toHaveBeenCalled();
    expect(saleReturnRepository.createItem).not.toHaveBeenCalled();
    expect(saleReturnRepository.updateItemReturnedQuantity).not.toHaveBeenCalled();
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });

  it("rejects returning more than was sold on the line, same as create()", async () => {
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(saleRow() as never);

    await expect(
      saleReturnService.quote({
        tenantId: 1n,
        saleId: 800n,
        items: [{ saleItemId: 900n, quantity: "31" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a quote outside the caller's scoped warehouse", async () => {
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(saleRow({ warehouseId: 10n }) as never);

    await expect(
      saleReturnService.quote({
        tenantId: 1n,
        saleId: 800n,
        items: [{ saleItemId: 900n, quantity: "5" }],
        scopedWarehouseId: 999n,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});
