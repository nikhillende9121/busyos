import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/shared/database/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback("return-tx")),
  },
}));

vi.mock("../repository/purchase-return.repository", () => ({
  purchaseReturnRepository: {
    findManyByTenant: vi.fn(),
    countByTenant: vi.fn(),
    findByIdForTenant: vi.fn(),
    findPurchaseForTenant: vi.fn(),
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

import { purchaseReturnRepository } from "../repository/purchase-return.repository";
import { inventoryService } from "@/modules/inventory/service/inventory.service";
import { purchaseReturnService } from "../service/purchase-return.service";

function purchaseItemRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 700n,
    purchaseId: 500n,
    productId: 100n,
    quantity: new Prisma.Decimal("100"),
    receivedQuantity: new Prisma.Decimal("100"),
    returnedQuantity: new Prisma.Decimal("0"),
    price: new Prisma.Decimal("50"),
    tax: new Prisma.Decimal("0"),
    ...overrides,
  };
}

function purchaseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 500n,
    tenantId: 1n,
    warehouseId: 10n,
    items: [purchaseItemRow()],
    ...overrides,
  };
}

describe("purchaseReturnService — warehouse scoping", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects returning a purchase outside the caller's scoped warehouse", async () => {
    vi.mocked(purchaseReturnRepository.findPurchaseForTenant).mockResolvedValue(purchaseRow({ warehouseId: 10n }) as never);

    await expect(
      purchaseReturnService.create({
        tenantId: 1n,
        purchaseId: 500n,
        reason: "Damaged goods",
        items: [{ purchaseItemId: 700n, quantity: "5" }],
        scopedWarehouseId: 999n,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("filters list() by the caller's scoped warehouse", async () => {
    vi.mocked(purchaseReturnRepository.findManyByTenant).mockResolvedValue([]);
    vi.mocked(purchaseReturnRepository.countByTenant).mockResolvedValue(0);

    await purchaseReturnService.list({ tenantId: 1n, scopedWarehouseId: 10n, page: 1, pageSize: 20 });

    expect(purchaseReturnRepository.findManyByTenant).toHaveBeenCalledWith(1n, {
      purchaseId: undefined,
      warehouseId: 10n,
      dateFrom: undefined,
      dateTo: undefined,
      skip: 0,
      take: 20,
    });
  });
});

describe("purchaseReturnService.list — pagination & date filter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(purchaseReturnRepository.findManyByTenant).mockResolvedValue([]);
    vi.mocked(purchaseReturnRepository.countByTenant).mockResolvedValue(45);
  });

  it("computes skip from page and pageSize, and returns pagination built from the count", async () => {
    const result = await purchaseReturnService.list({ tenantId: 1n, page: 3, pageSize: 20 });

    expect(purchaseReturnRepository.findManyByTenant).toHaveBeenCalledWith(
      1n,
      expect.objectContaining({ skip: 40, take: 20 }),
    );
    expect(result.pagination).toEqual({ page: 3, pageSize: 20, total: 45, totalPages: 3 });
  });
});

describe("purchaseReturnService.exportList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches every matching row with no skip/take", async () => {
    vi.mocked(purchaseReturnRepository.findManyByTenant).mockResolvedValue([]);
    const dateFrom = new Date("2026-01-01T00:00:00.000Z");

    await purchaseReturnService.exportList({ tenantId: 1n, dateFrom });

    const callArgs = vi.mocked(purchaseReturnRepository.findManyByTenant).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(callArgs).toMatchObject({ dateFrom });
    expect(callArgs.skip).toBeUndefined();
    expect(callArgs.take).toBeUndefined();
    expect(purchaseReturnRepository.countByTenant).not.toHaveBeenCalled();
  });
});

describe("purchaseReturnService.create", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(purchaseReturnRepository.create).mockResolvedValue({
      id: 900n,
      purchaseId: 500n,
      reason: "Damaged goods",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: null,
    } as never);
    vi.mocked(purchaseReturnRepository.createItem).mockImplementation(
      (async (_tx: unknown, data: Record<string, unknown>) => ({ id: 1000n, ...data })) as never,
    );
  });

  it("rejects a purchase outside the tenant", async () => {
    vi.mocked(purchaseReturnRepository.findPurchaseForTenant).mockResolvedValue(null);

    await expect(
      purchaseReturnService.create({
        tenantId: 1n,
        purchaseId: 999n,
        reason: "Damaged goods",
        items: [{ purchaseItemId: 700n, quantity: "10" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(purchaseReturnRepository.create).not.toHaveBeenCalled();
  });

  it("rejects returning more than was received (even if it was ordered)", async () => {
    vi.mocked(purchaseReturnRepository.findPurchaseForTenant).mockResolvedValue(
      purchaseRow({
        items: [purchaseItemRow({ quantity: new Prisma.Decimal("100"), receivedQuantity: new Prisma.Decimal("40") })],
      }) as never,
    );

    await expect(
      purchaseReturnService.create({
        tenantId: 1n,
        purchaseId: 500n,
        reason: "Damaged goods",
        items: [{ purchaseItemId: 700n, quantity: "50" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(purchaseReturnRepository.create).not.toHaveBeenCalled();
  });

  it("rejects returning more than remains after a prior partial return", async () => {
    vi.mocked(purchaseReturnRepository.findPurchaseForTenant).mockResolvedValue(
      purchaseRow({
        items: [
          purchaseItemRow({
            receivedQuantity: new Prisma.Decimal("100"),
            returnedQuantity: new Prisma.Decimal("90"),
          }),
        ],
      }) as never,
    );

    await expect(
      purchaseReturnService.create({
        tenantId: 1n,
        purchaseId: 500n,
        reason: "Damaged goods",
        items: [{ purchaseItemId: 700n, quantity: "20" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("records the return, decrements stock, and updates returnedQuantity", async () => {
    vi.mocked(purchaseReturnRepository.findPurchaseForTenant).mockResolvedValue(purchaseRow() as never);

    const result = await purchaseReturnService.create({
      tenantId: 1n,
      purchaseId: 500n,
      reason: "Damaged goods",
      items: [{ purchaseItemId: 700n, quantity: "10" }],
    });

    expect(result).toMatchObject({
      purchaseId: "500",
      reason: "Damaged goods",
      items: [{ purchaseItemId: "700", productId: "100", quantity: "10" }],
    });
    expect(purchaseReturnRepository.updateItemReturnedQuantity).toHaveBeenCalledWith(
      "return-tx",
      700n,
      new Prisma.Decimal("10"),
    );
    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: 10n,
        productId: 100n,
        transactionType: "PURCHASE_RETURN_OUT",
        quantityDelta: "-10",
        referenceType: "PURCHASE_RETURN",
        referenceId: 900n,
      }),
      "return-tx",
    );
  });
});
