import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/shared/database/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback("purchase-tx")),
  },
}));

vi.mock("../repository/purchase.repository", () => ({
  purchaseRepository: {
    findManyByTenant: vi.fn(),
    countByTenant: vi.fn(),
    findByIdForTenant: vi.fn(),
    findByIdTx: vi.fn(),
    create: vi.fn(),
    createItem: vi.fn(),
    createItemTaxes: vi.fn(),
    createCharge: vi.fn(),
    updateStatus: vi.fn(),
    updateItemReceivedQuantity: vi.fn(),
    findItemsForPurchase: vi.fn(),
    findSupplierForTenant: vi.fn(),
    findWarehouseForTenant: vi.fn(),
    findProductForTenant: vi.fn(),
    findExtraChargeForTenant: vi.fn(),
  },
}));

vi.mock("@/modules/inventory/service/inventory.service", () => ({
  inventoryService: {
    recordMovement: vi.fn(),
  },
}));

vi.mock("@/modules/pricing/service/tax.service", () => ({
  taxService: {
    resolvePurchaseContext: vi.fn(),
    computeLinesTax: vi.fn(),
    computeChargeTax: vi.fn(),
  },
}));

import { purchaseRepository } from "../repository/purchase.repository";
import { inventoryService } from "@/modules/inventory/service/inventory.service";
import { taxService } from "@/modules/pricing/service/tax.service";
import { purchaseService } from "../service/purchase.service";

const DEFAULT_TAX_CONTEXT = { isIntraState: true, taxInclusivePricing: false, defaultTaxRateId: null };
const DEFAULT_LINE_TAX = [{ taxRateId: "1", taxableAmount: "500", components: [], taxTotal: "0" }];

function purchaseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 500n,
    tenantId: 1n,
    supplierId: 20n,
    warehouseId: 10n,
    status: "ORDERED",
    purchaseDate: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    items: [],
    charges: [],
    ...overrides,
  };
}

function purchaseItemRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 700n,
    purchaseId: 500n,
    productId: 100n,
    quantity: new Prisma.Decimal("10"),
    receivedQuantity: new Prisma.Decimal("0"),
    price: new Prisma.Decimal("50"),
    tax: new Prisma.Decimal("0"),
    taxes: [],
    ...overrides,
  };
}

describe("purchaseService — warehouse scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(purchaseRepository.findSupplierForTenant).mockResolvedValue({ id: 20n } as never);
    vi.mocked(purchaseRepository.findWarehouseForTenant).mockResolvedValue({ id: 10n } as never);
    vi.mocked(purchaseRepository.findProductForTenant).mockResolvedValue({ id: 100n } as never);
    vi.mocked(purchaseRepository.create).mockResolvedValue(purchaseRow({ status: "DRAFT" }) as never);
    vi.mocked(purchaseRepository.createItem).mockResolvedValue(purchaseItemRow() as never);
    vi.mocked(purchaseRepository.findByIdTx).mockResolvedValue(
      purchaseRow({ status: "DRAFT", items: [purchaseItemRow()] }) as never,
    );
    vi.mocked(taxService.resolvePurchaseContext).mockResolvedValue(DEFAULT_TAX_CONTEXT as never);
    vi.mocked(taxService.computeLinesTax).mockResolvedValue(DEFAULT_LINE_TAX as never);
  });

  it("rejects creating a purchase at a warehouse outside the caller's scope", async () => {
    await expect(
      purchaseService.create({
        tenantId: 1n,
        supplierId: 20n,
        warehouseId: 10n,
        purchaseDate: new Date(),
        items: [{ productId: 100n, quantity: "10", price: "50" }],
        scopedWarehouseId: 999n,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(purchaseRepository.findSupplierForTenant).not.toHaveBeenCalled();
  });

  it("rejects confirming a purchase outside the caller's scoped warehouse", async () => {
    vi.mocked(purchaseRepository.findByIdForTenant).mockResolvedValue(purchaseRow({ warehouseId: 10n }) as never);

    await expect(purchaseService.confirm(1n, 500n, 999n)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(purchaseRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("filters list() by the caller's scoped warehouse", async () => {
    vi.mocked(purchaseRepository.findManyByTenant).mockResolvedValue([]);
    vi.mocked(purchaseRepository.countByTenant).mockResolvedValue(0);

    await purchaseService.list({ tenantId: 1n, scopedWarehouseId: 10n, page: 1, pageSize: 20 });

    expect(purchaseRepository.findManyByTenant).toHaveBeenCalledWith(
      1n,
      expect.objectContaining({ warehouseId: 10n, skip: 0, take: 20 }),
    );
  });
});

describe("purchaseService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(purchaseRepository.findSupplierForTenant).mockResolvedValue({ id: 20n } as never);
    vi.mocked(purchaseRepository.findWarehouseForTenant).mockResolvedValue({ id: 10n } as never);
    vi.mocked(purchaseRepository.findProductForTenant).mockResolvedValue({ id: 100n } as never);
    vi.mocked(purchaseRepository.create).mockResolvedValue(purchaseRow({ status: "DRAFT" }) as never);
    vi.mocked(purchaseRepository.createItem).mockResolvedValue(purchaseItemRow() as never);
    vi.mocked(purchaseRepository.findByIdTx).mockResolvedValue(
      purchaseRow({ status: "DRAFT", items: [purchaseItemRow()] }) as never,
    );
    vi.mocked(taxService.resolvePurchaseContext).mockResolvedValue(DEFAULT_TAX_CONTEXT as never);
    vi.mocked(taxService.computeLinesTax).mockResolvedValue(DEFAULT_LINE_TAX as never);
  });

  it("rejects a supplier outside the tenant before opening a transaction", async () => {
    vi.mocked(purchaseRepository.findSupplierForTenant).mockResolvedValue(null);

    await expect(
      purchaseService.create({
        tenantId: 1n,
        supplierId: 999n,
        warehouseId: 10n,
        purchaseDate: new Date(),
        items: [{ productId: 100n, quantity: "10", price: "50" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(purchaseRepository.create).not.toHaveBeenCalled();
  });

  it("creates a DRAFT purchase with its items when every reference belongs to the tenant", async () => {
    const purchase = await purchaseService.create({
      tenantId: 1n,
      supplierId: 20n,
      warehouseId: 10n,
      purchaseDate: new Date("2026-01-01T00:00:00.000Z"),
      items: [{ productId: 100n, quantity: "10", price: "50" }],
    });

    expect(purchase.status).toBe("DRAFT");
    expect(purchase.items).toEqual([
      { id: "700", productId: "100", quantity: "10", receivedQuantity: "0", price: "50", tax: "0", taxes: [] },
    ]);
  });
});

describe("purchaseService.create — tax engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(purchaseRepository.findSupplierForTenant).mockResolvedValue({ id: 20n } as never);
    vi.mocked(purchaseRepository.findWarehouseForTenant).mockResolvedValue({ id: 10n } as never);
    vi.mocked(purchaseRepository.findProductForTenant).mockResolvedValue({ id: 100n } as never);
    vi.mocked(purchaseRepository.create).mockResolvedValue(purchaseRow({ status: "DRAFT" }) as never);
    vi.mocked(purchaseRepository.createItem).mockResolvedValue(purchaseItemRow() as never);
    vi.mocked(purchaseRepository.findByIdTx).mockResolvedValue(
      purchaseRow({ status: "DRAFT", items: [purchaseItemRow()] }) as never,
    );
    vi.mocked(taxService.resolvePurchaseContext).mockResolvedValue(DEFAULT_TAX_CONTEXT as never);
  });

  it("computes tax directly on quantity*price (purchases have no discount engine)", async () => {
    vi.mocked(taxService.computeLinesTax).mockResolvedValue([
      {
        taxRateId: "5",
        taxableAmount: "500",
        components: [{ component: "IGST", ratePercent: "18", amount: "90" }],
        taxTotal: "90",
      },
    ] as never);

    await purchaseService.create({
      tenantId: 1n,
      supplierId: 20n,
      warehouseId: 10n,
      purchaseDate: new Date(),
      items: [{ productId: 100n, quantity: "10", price: "50" }],
    });

    expect(taxService.resolvePurchaseContext).toHaveBeenCalledWith({
      tenantId: 1n,
      warehouseId: 10n,
      supplierId: 20n,
    });
    expect(taxService.computeLinesTax).toHaveBeenCalledWith(
      1n,
      DEFAULT_TAX_CONTEXT,
      [{ productId: 100n, lineTotal: "500" }],
    );
    const createItemCall = vi.mocked(purchaseRepository.createItem).mock.calls[0][1] as { tax: Prisma.Decimal };
    expect(createItemCall.tax.toString()).toBe("90");
    expect(purchaseRepository.createItemTaxes).toHaveBeenCalledWith(
      "purchase-tx",
      expect.arrayContaining([expect.objectContaining({ component: "IGST" })]),
    );
  });

  it("propagates a no-tax-rate-configured rejection without creating the purchase", async () => {
    vi.mocked(taxService.computeLinesTax).mockRejectedValue(
      Object.assign(new Error("no rate"), { code: "VALIDATION_ERROR" }),
    );

    await expect(
      purchaseService.create({
        tenantId: 1n,
        supplierId: 20n,
        warehouseId: 10n,
        purchaseDate: new Date(),
        items: [{ productId: 100n, quantity: "10", price: "50" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(purchaseRepository.create).not.toHaveBeenCalled();
  });

  it("resolves and attaches extra charges, computing tax on a taxable one", async () => {
    vi.mocked(taxService.computeLinesTax).mockResolvedValue([
      { taxRateId: "5", taxableAmount: "500", components: [], taxTotal: "0" },
    ] as never);
    vi.mocked(purchaseRepository.findExtraChargeForTenant).mockResolvedValue({
      id: 8n,
      name: "Freight",
      calcType: "FLAT",
      value: new Prisma.Decimal("100"),
      isTaxable: true,
      taxRateId: 5n,
    } as never);
    vi.mocked(taxService.computeChargeTax).mockResolvedValue({
      taxRateId: "5",
      taxableAmount: "100",
      components: [{ component: "IGST", ratePercent: "18", amount: "18" }],
      taxTotal: "18",
    } as never);

    await purchaseService.create({
      tenantId: 1n,
      supplierId: 20n,
      warehouseId: 10n,
      purchaseDate: new Date(),
      items: [{ productId: 100n, quantity: "10", price: "50" }],
      extraChargeIds: [8n],
    });

    expect(purchaseRepository.findExtraChargeForTenant).toHaveBeenCalledWith(1n, 8n);
    expect(taxService.computeChargeTax).toHaveBeenCalledWith(1n, DEFAULT_TAX_CONTEXT, {
      amount: "100",
      taxRateId: 5n,
    });
    expect(purchaseRepository.createCharge).toHaveBeenCalledWith(
      "purchase-tx",
      expect.objectContaining({ name: "Freight", taxRateId: 5n }),
    );
  });
});

describe("purchaseService.confirm / cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirms a DRAFT purchase, moving it to ORDERED", async () => {
    vi.mocked(purchaseRepository.findByIdForTenant).mockResolvedValue(
      purchaseRow({ status: "DRAFT" }) as never,
    );
    vi.mocked(purchaseRepository.updateStatus).mockResolvedValue(
      purchaseRow({ status: "ORDERED" }) as never,
    );

    const purchase = await purchaseService.confirm(1n, 500n);

    expect(purchase.status).toBe("ORDERED");
  });

  it("rejects confirming a purchase that isn't DRAFT", async () => {
    vi.mocked(purchaseRepository.findByIdForTenant).mockResolvedValue(
      purchaseRow({ status: "ORDERED" }) as never,
    );

    await expect(purchaseService.confirm(1n, 500n)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects cancelling a RECEIVED purchase", async () => {
    vi.mocked(purchaseRepository.findByIdForTenant).mockResolvedValue(
      purchaseRow({ status: "RECEIVED" }) as never,
    );

    await expect(purchaseService.cancel(1n, 500n)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});

describe("purchaseService.receive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects receiving against a DRAFT purchase", async () => {
    vi.mocked(purchaseRepository.findByIdForTenant).mockResolvedValue(
      purchaseRow({ status: "DRAFT", items: [purchaseItemRow()] }) as never,
    );

    await expect(
      purchaseService.receive({
        tenantId: 1n,
        purchaseId: 500n,
        items: [{ purchaseItemId: 700n, receivedQuantity: "5" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });

  it("rejects receiving more than the remaining quantity on a line", async () => {
    vi.mocked(purchaseRepository.findByIdForTenant).mockResolvedValue(
      purchaseRow({
        status: "ORDERED",
        items: [purchaseItemRow({ quantity: new Prisma.Decimal("10"), receivedQuantity: new Prisma.Decimal("8") })],
      }) as never,
    );

    await expect(
      purchaseService.receive({
        tenantId: 1n,
        purchaseId: 500n,
        items: [{ purchaseItemId: 700n, receivedQuantity: "5" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });

  it("moves to PARTIALLY_RECEIVED and records a PURCHASE_IN movement for a partial receipt", async () => {
    vi.mocked(purchaseRepository.findByIdForTenant).mockResolvedValue(
      purchaseRow({
        status: "ORDERED",
        items: [purchaseItemRow({ quantity: new Prisma.Decimal("10"), receivedQuantity: new Prisma.Decimal("0") })],
      }) as never,
    );
    vi.mocked(purchaseRepository.findItemsForPurchase).mockResolvedValue([
      purchaseItemRow({ quantity: new Prisma.Decimal("10"), receivedQuantity: new Prisma.Decimal("4") }),
    ] as never);
    vi.mocked(purchaseRepository.updateStatus).mockResolvedValue(
      purchaseRow({ status: "PARTIALLY_RECEIVED" }) as never,
    );

    const purchase = await purchaseService.receive({
      tenantId: 1n,
      purchaseId: 500n,
      items: [{ purchaseItemId: 700n, receivedQuantity: "4" }],
    });

    expect(purchase.status).toBe("PARTIALLY_RECEIVED");
    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: 10n,
        productId: 100n,
        transactionType: "PURCHASE_IN",
        quantityDelta: "4",
        referenceType: "PURCHASE",
        referenceId: 500n,
      }),
      "purchase-tx",
    );
    expect(purchaseRepository.updateStatus).toHaveBeenCalledWith(
      "purchase-tx",
      500n,
      "PARTIALLY_RECEIVED",
    );
  });

  it("moves to RECEIVED once every item is fully received", async () => {
    vi.mocked(purchaseRepository.findByIdForTenant).mockResolvedValue(
      purchaseRow({
        status: "PARTIALLY_RECEIVED",
        items: [purchaseItemRow({ quantity: new Prisma.Decimal("10"), receivedQuantity: new Prisma.Decimal("4") })],
      }) as never,
    );
    vi.mocked(purchaseRepository.findItemsForPurchase).mockResolvedValue([
      purchaseItemRow({ quantity: new Prisma.Decimal("10"), receivedQuantity: new Prisma.Decimal("10") }),
    ] as never);
    vi.mocked(purchaseRepository.updateStatus).mockResolvedValue(
      purchaseRow({ status: "RECEIVED" }) as never,
    );

    const purchase = await purchaseService.receive({
      tenantId: 1n,
      purchaseId: 500n,
      items: [{ purchaseItemId: 700n, receivedQuantity: "6" }],
    });

    expect(purchase.status).toBe("RECEIVED");
    expect(purchaseRepository.updateStatus).toHaveBeenCalledWith("purchase-tx", 500n, "RECEIVED");
  });
});

describe("purchaseService.list — pagination & date filter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(purchaseRepository.findManyByTenant).mockResolvedValue([]);
    vi.mocked(purchaseRepository.countByTenant).mockResolvedValue(45);
  });

  it("computes skip from page and pageSize, and returns pagination built from the count", async () => {
    const result = await purchaseService.list({ tenantId: 1n, page: 3, pageSize: 20 });

    expect(purchaseRepository.findManyByTenant).toHaveBeenCalledWith(
      1n,
      expect.objectContaining({ skip: 40, take: 20 }),
    );
    expect(result.pagination).toEqual({ page: 3, pageSize: 20, total: 45, totalPages: 3 });
  });

  it("passes dateFrom/dateTo through to the repository", async () => {
    const dateFrom = new Date("2026-01-01T00:00:00.000Z");
    const dateTo = new Date("2026-01-31T00:00:00.000Z");

    await purchaseService.list({ tenantId: 1n, page: 1, pageSize: 20, dateFrom, dateTo });

    expect(purchaseRepository.findManyByTenant).toHaveBeenCalledWith(1n, expect.objectContaining({ dateFrom, dateTo }));
    expect(purchaseRepository.countByTenant).toHaveBeenCalledWith(1n, expect.objectContaining({ dateFrom, dateTo }));
  });
});

describe("purchaseService.exportList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches every matching row with no skip/take, honoring the same filters as list()", async () => {
    vi.mocked(purchaseRepository.findManyByTenant).mockResolvedValue([purchaseRow()] as never);
    const dateFrom = new Date("2026-01-01T00:00:00.000Z");

    const purchases = await purchaseService.exportList({ tenantId: 1n, status: "ORDERED", dateFrom });

    expect(purchases).toHaveLength(1);
    const callArgs = vi.mocked(purchaseRepository.findManyByTenant).mock.calls[0][1] as Record<string, unknown>;
    expect(callArgs).toMatchObject({ status: "ORDERED", dateFrom });
    expect(callArgs.skip).toBeUndefined();
    expect(callArgs.take).toBeUndefined();
    expect(purchaseRepository.countByTenant).not.toHaveBeenCalled();
  });
});
