import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/shared/database/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback("sale-exchange-tx")),
  },
}));

vi.mock("../repository/sale-return.repository", () => ({
  saleReturnRepository: {
    findSaleForTenant: vi.fn(),
    create: vi.fn(),
    createItem: vi.fn(),
    updateItemReturnedQuantity: vi.fn(),
  },
}));

vi.mock("../repository/sale.repository", () => ({
  saleRepository: {
    findCustomerForTenant: vi.fn(),
    findProductForTenant: vi.fn(),
    create: vi.fn(),
    createItem: vi.fn(),
    createItemTaxes: vi.fn(),
    createCharge: vi.fn(),
  },
}));

vi.mock("../repository/sale-exchange.repository", () => ({
  saleExchangeRepository: {
    create: vi.fn(),
    findManyByTenant: vi.fn(),
    countByTenant: vi.fn(),
  },
}));

vi.mock("@/modules/inventory/service/inventory.service", () => ({
  inventoryService: {
    recordMovement: vi.fn(),
  },
}));

vi.mock("@/modules/pricing/service/promotion.service", () => ({
  promotionService: {
    quote: vi.fn(),
    applyQuoteToSale: vi.fn(),
  },
}));

vi.mock("../service/sale.service", () => ({
  resolveItemPrice: vi.fn(),
  resolveTaxInclusive: vi.fn(),
  toSaleView: vi.fn(() => ({ id: "new-sale-view" })),
}));

import { saleReturnRepository } from "../repository/sale-return.repository";
import { saleRepository } from "../repository/sale.repository";
import { saleExchangeRepository } from "../repository/sale-exchange.repository";
import { inventoryService } from "@/modules/inventory/service/inventory.service";
import { promotionService } from "@/modules/pricing/service/promotion.service";
import { resolveItemPrice, resolveTaxInclusive } from "../service/sale.service";
import { saleExchangeService } from "../service/sale-exchange.service";

function saleItemRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 900n,
    saleId: 800n,
    productId: 100n,
    quantity: new Prisma.Decimal("10"),
    returnedQuantity: new Prisma.Decimal("0"),
    price: new Prisma.Decimal("50"),
    tax: new Prisma.Decimal("0"),
    ...overrides,
  };
}

function saleRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 800n,
    tenantId: 1n,
    warehouseId: 10n,
    customerId: null,
    status: "CONFIRMED",
    items: [saleItemRow()],
    discounts: [] as { saleItemId: bigint | null; amount: Prisma.Decimal }[],
    ...overrides,
  };
}

// quote()'s tax/charges are now computed inside promotionService.quote()
// itself (see promotion.service.ts and its own dedicated coverage in
// promotion.service.test.ts) — resolveExchange() no longer calls taxService
// directly, so grandTotal in this mock must already reflect tax the way the
// real quote() would compute it.
const NEW_ITEM_QUOTE_LINE = {
  productId: "200",
  quantity: "1",
  unitPrice: "60",
  lineSubtotal: "60",
  discounts: [],
  lineTotal: "60",
  tax: "3",
  taxes: [{ taxRateId: "1", component: "IGST", ratePercent: "5", amount: "3" }],
};

describe("saleExchangeService.quote", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(saleRepository.findProductForTenant).mockResolvedValue({ id: 200n, categoryId: null } as never);
    vi.mocked(resolveItemPrice).mockResolvedValue("60");
    vi.mocked(promotionService.quote).mockResolvedValue({
      lines: [NEW_ITEM_QUOTE_LINE],
      subtotal: "60",
      lineDiscountTotal: "0",
      coupon: null,
      charges: [],
      chargesTotal: "0",
      chargesTaxTotal: "0",
      taxTotal: "3",
      taxInclusive: false,
      // Tax-exclusive: 60 subtotal + 3 line tax, no charges.
      grandTotal: "63",
    } as never);
  });

  it("computes the settlement without persisting anything", async () => {
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(saleRow() as never);

    const result = await saleExchangeService.quote({
      tenantId: 1n,
      saleId: 800n,
      returnItems: [{ saleItemId: 900n, quantity: "5" }],
      newItems: [{ productId: 200n, quantity: "1" }],
    });

    // Return side: 5 units @ 50 (no discount) = 250 refund.
    // New side: quote.grandTotal is already 63 (60 + 3 tax).
    // difference = 63 - 250 = -187 -> REFUND_DUE, amount 187.
    expect(result).toEqual({
      returnItems: [{ saleItemId: "900", productId: "100", quantity: "5", refundAmount: "250" }],
      newItems: [{ productId: "200", quantity: "1", amount: "60" }],
      chargesTotal: "0",
      taxTotal: "3",
      differenceAmount: "187",
      differenceDirection: "REFUND_DUE",
    });

    expect(saleReturnRepository.create).not.toHaveBeenCalled();
    expect(saleRepository.create).not.toHaveBeenCalled();
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
    expect(promotionService.applyQuoteToSale).not.toHaveBeenCalled();
  });

  it("rejects returning more than was sold on the line, same as create()", async () => {
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(saleRow() as never);

    await expect(
      saleExchangeService.quote({
        tenantId: 1n,
        saleId: 800n,
        returnItems: [{ saleItemId: 900n, quantity: "11" }],
        newItems: [{ productId: 200n, quantity: "1" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a quote outside the caller's scoped warehouse", async () => {
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(saleRow({ warehouseId: 10n }) as never);

    await expect(
      saleExchangeService.quote({
        tenantId: 1n,
        saleId: 800n,
        returnItems: [{ saleItemId: 900n, quantity: "5" }],
        newItems: [{ productId: 200n, quantity: "1" }],
        scopedWarehouseId: 999n,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("rejects a sale outside the tenant", async () => {
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(null);

    await expect(
      saleExchangeService.quote({
        tenantId: 1n,
        saleId: 999n,
        returnItems: [{ saleItemId: 900n, quantity: "5" }],
        newItems: [{ productId: 200n, quantity: "1" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("saleExchangeService.create", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(saleReturnRepository.create).mockResolvedValue({
      id: 1100n,
      saleId: 800n,
      reason: "swap size",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);
    vi.mocked(saleReturnRepository.createItem).mockImplementation(
      (async (_tx: unknown, data: Record<string, unknown>) => ({ id: 1200n, ...data })) as never,
    );
    vi.mocked(saleRepository.findProductForTenant).mockResolvedValue({ id: 200n, categoryId: null } as never);
    vi.mocked(resolveItemPrice).mockResolvedValue("50");
    vi.mocked(saleRepository.create).mockResolvedValue({ id: 2000n } as never);
    vi.mocked(saleRepository.createItem).mockResolvedValue({ id: 2100n } as never);
    vi.mocked(resolveTaxInclusive).mockResolvedValue(false);
    vi.mocked(saleExchangeRepository.create).mockResolvedValue({
      id: 3000n,
      saleReturn: { id: 1100n, saleId: 800n, reason: "swap size", items: [], createdAt: new Date("2026-01-01T00:00:00.000Z") },
      newSale: {},
      differenceAmount: new Prisma.Decimal("0"),
      differenceDirection: "EVEN",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);
  });

  // Return side: 1 unit @ 50 (no discount) = 50 refund. New side: quote
  // grandTotal fixed at 50 too, so the settlement nets to EVEN — keeps this
  // test from needing to exercise the Payment-creation branch (the mocked
  // prisma.$transaction hands the callback a bare string, not a real tx
  // with .payment.create).
  it("persists each new item's tax/tax-components and charges exactly as quote() computed them", async () => {
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(saleRow() as never);
    vi.mocked(promotionService.quote).mockResolvedValue({
      lines: [
        {
          productId: "200",
          quantity: "1",
          unitPrice: "50",
          lineSubtotal: "50",
          discounts: [],
          lineTotal: "50",
          tax: "9",
          taxes: [{ taxRateId: "5", component: "IGST", ratePercent: "18", amount: "9" }],
        },
      ],
      subtotal: "50",
      lineDiscountTotal: "0",
      coupon: null,
      charges: [{ extraChargeId: "7", taxRateId: "5", name: "Shipping", amount: "0", taxAmount: "0" }],
      chargesTotal: "0",
      chargesTaxTotal: "0",
      taxTotal: "9",
      taxInclusive: false,
      grandTotal: "50",
    } as never);

    await saleExchangeService.create({
      tenantId: 1n,
      saleId: 800n,
      reason: "swap size",
      returnItems: [{ saleItemId: 900n, quantity: "1" }],
      newItems: [{ productId: 200n, quantity: "1" }],
      paymentMethod: "CASH",
    });

    const createItemCall = vi.mocked(saleRepository.createItem).mock.calls[0][1] as { tax: Prisma.Decimal };
    expect(createItemCall.tax.toString()).toBe("9");
    expect(saleRepository.createItemTaxes).toHaveBeenCalledWith(
      "sale-exchange-tx",
      expect.arrayContaining([expect.objectContaining({ component: "IGST", taxRateId: 5n })]),
    );
    expect(saleRepository.createCharge).toHaveBeenCalledWith(
      "sale-exchange-tx",
      expect.objectContaining({ name: "Shipping", extraChargeId: 7n, taxRateId: 5n }),
    );
    expect(saleExchangeRepository.create).toHaveBeenCalledWith(
      "sale-exchange-tx",
      expect.objectContaining({ differenceDirection: "EVEN" }),
    );
  });

  it("rejects creating an exchange outside the caller's scoped warehouse", async () => {
    vi.mocked(saleReturnRepository.findSaleForTenant).mockResolvedValue(saleRow({ warehouseId: 10n }) as never);

    await expect(
      saleExchangeService.create({
        tenantId: 1n,
        saleId: 800n,
        reason: "swap size",
        returnItems: [{ saleItemId: 900n, quantity: "1" }],
        newItems: [{ productId: 200n, quantity: "1" }],
        paymentMethod: "CASH",
        scopedWarehouseId: 999n,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

    expect(saleReturnRepository.create).not.toHaveBeenCalled();
  });
});

describe("saleExchangeService.list — pagination & date filter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(saleExchangeRepository.findManyByTenant).mockResolvedValue([]);
    vi.mocked(saleExchangeRepository.countByTenant).mockResolvedValue(45);
    vi.mocked(resolveTaxInclusive).mockResolvedValue(false);
  });

  it("computes skip from page and pageSize, and returns pagination built from the count", async () => {
    const result = await saleExchangeService.list({ tenantId: 1n, page: 3, pageSize: 20 });

    expect(saleExchangeRepository.findManyByTenant).toHaveBeenCalledWith(
      1n,
      expect.objectContaining({ skip: 40, take: 20 }),
    );
    expect(result.pagination).toEqual({ page: 3, pageSize: 20, total: 45, totalPages: 3 });
  });

  it("passes dateFrom/dateTo through to the repository", async () => {
    const dateFrom = new Date("2026-01-01T00:00:00.000Z");
    const dateTo = new Date("2026-01-31T00:00:00.000Z");

    await saleExchangeService.list({ tenantId: 1n, page: 1, pageSize: 20, dateFrom, dateTo });

    expect(saleExchangeRepository.findManyByTenant).toHaveBeenCalledWith(
      1n,
      expect.objectContaining({ dateFrom, dateTo }),
    );
  });
});

describe("saleExchangeService.exportList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveTaxInclusive).mockResolvedValue(false);
  });

  it("fetches every matching row with no skip/take", async () => {
    vi.mocked(saleExchangeRepository.findManyByTenant).mockResolvedValue([]);
    const dateFrom = new Date("2026-01-01T00:00:00.000Z");

    await saleExchangeService.exportList({ tenantId: 1n, dateFrom });

    const callArgs = vi.mocked(saleExchangeRepository.findManyByTenant).mock.calls[0][1] as Record<string, unknown>;
    expect(callArgs).toMatchObject({ dateFrom });
    expect(callArgs.skip).toBeUndefined();
    expect(callArgs.take).toBeUndefined();
    expect(saleExchangeRepository.countByTenant).not.toHaveBeenCalled();
  });
});
