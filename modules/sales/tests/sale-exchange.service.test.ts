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

vi.mock("@/modules/pricing/service/tax.service", () => ({
  taxService: {
    resolveContext: vi.fn(),
    computeLinesTax: vi.fn(),
  },
}));

vi.mock("../service/sale.service", () => ({
  resolveItemPrice: vi.fn(),
  resolveSaleCharges: vi.fn(),
  toSaleView: vi.fn(() => ({ id: "new-sale-view" })),
}));

import { saleReturnRepository } from "../repository/sale-return.repository";
import { saleRepository } from "../repository/sale.repository";
import { inventoryService } from "@/modules/inventory/service/inventory.service";
import { promotionService } from "@/modules/pricing/service/promotion.service";
import { taxService } from "@/modules/pricing/service/tax.service";
import { resolveItemPrice, resolveSaleCharges } from "../service/sale.service";
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

describe("saleExchangeService.quote", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(saleRepository.findProductForTenant).mockResolvedValue({ id: 200n, categoryId: null } as never);
    vi.mocked(resolveItemPrice).mockResolvedValue("60");
    vi.mocked(promotionService.quote).mockResolvedValue({
      lines: [{ productId: "200", quantity: "1", unitPrice: "60", lineSubtotal: "60", discounts: [], lineTotal: "60" }],
      subtotal: "60",
      lineDiscountTotal: "0",
      coupon: null,
      charges: [],
      chargesTotal: "0",
      chargesTaxTotal: "0",
      grandTotal: "60",
    } as never);
    vi.mocked(taxService.resolveContext).mockResolvedValue({
      isIntraState: true,
      taxInclusivePricing: false,
      defaultTaxRateId: 1n,
    } as never);
    vi.mocked(taxService.computeLinesTax).mockResolvedValue([
      { taxRateId: "1", taxTotal: "3", components: [] },
    ] as never);
    vi.mocked(resolveSaleCharges).mockResolvedValue([]);
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
    // New side: quote.grandTotal 60 + line tax 3 = 63 owed.
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
