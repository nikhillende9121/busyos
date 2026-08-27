import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { AppError } from "@/shared/errors/app-error";

vi.mock("@/shared/database/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback("sale-tx")),
  },
}));

vi.mock("../repository/sale.repository", () => ({
  saleRepository: {
    findManyByTenant: vi.fn(),
    findByIdForTenant: vi.fn(),
    findByIdTx: vi.fn(),
    create: vi.fn(),
    createItem: vi.fn(),
    createItemTaxes: vi.fn(),
    createCharge: vi.fn(),
    updateStatus: vi.fn(),
    findDiscountsForSale: vi.fn(),
    findCustomerForTenant: vi.fn(),
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

vi.mock("@/modules/pricing/service/promotion.service", () => ({
  promotionService: {
    quote: vi.fn(),
    applyQuoteToSale: vi.fn(),
  },
}));

vi.mock("@/modules/pricing/service/price-list.service", () => ({
  priceListService: {
    resolvePrice: vi.fn(),
  },
}));

vi.mock("@/modules/pricing/service/tax.service", () => ({
  taxService: {
    resolveContext: vi.fn(),
    computeLinesTax: vi.fn(),
    computeChargeTax: vi.fn(),
  },
}));

vi.mock("@/shared/middleware/rbac-lookup", () => ({
  rbacLookup: {
    isFeatureEnabledForTenant: vi.fn(),
  },
}));

import { saleRepository } from "../repository/sale.repository";
import { inventoryService } from "@/modules/inventory/service/inventory.service";
import { promotionService } from "@/modules/pricing/service/promotion.service";
import { priceListService } from "@/modules/pricing/service/price-list.service";
import { taxService } from "@/modules/pricing/service/tax.service";
import { rbacLookup } from "@/shared/middleware/rbac-lookup";
import { saleService } from "../service/sale.service";

const DEFAULT_TAX_CONTEXT = { isIntraState: true, taxInclusivePricing: false, defaultTaxRateId: null };
const DEFAULT_LINE_TAX = [{ taxRateId: "1", taxableAmount: "630", components: [], taxTotal: "0" }];

const EMPTY_QUOTE = {
  lines: [],
  subtotal: "0",
  lineDiscountTotal: "0",
  coupon: null,
  grandTotal: "0",
};

function saleRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 800n,
    tenantId: 1n,
    customerId: 30n,
    warehouseId: 10n,
    channel: "POS",
    status: "DRAFT",
    saleDate: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    items: [
      {
        id: 900n,
        saleId: 800n,
        productId: 100n,
        quantity: new Prisma.Decimal("2"),
        price: new Prisma.Decimal("630"),
        tax: new Prisma.Decimal("0"),
        taxes: [],
      },
    ],
    discounts: [],
    charges: [],
    ...overrides,
  };
}

describe("saleService — warehouse scoping", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(rbacLookup.isFeatureEnabledForTenant).mockResolvedValue(true);
    vi.mocked(saleRepository.findCustomerForTenant).mockResolvedValue({
      id: 30n,
      customerGroupId: null,
    } as never);
    vi.mocked(saleRepository.findWarehouseForTenant).mockResolvedValue({ id: 10n } as never);
    vi.mocked(saleRepository.findProductForTenant).mockResolvedValue({ id: 100n, categoryId: null } as never);
    vi.mocked(priceListService.resolvePrice).mockResolvedValue({ priceListId: "1", price: "630" } as never);
    vi.mocked(promotionService.quote).mockResolvedValue(EMPTY_QUOTE as never);
    vi.mocked(taxService.resolveContext).mockResolvedValue(DEFAULT_TAX_CONTEXT as never);
    vi.mocked(taxService.computeLinesTax).mockResolvedValue(DEFAULT_LINE_TAX as never);
    vi.mocked(saleRepository.findByIdTx).mockResolvedValue(saleRow() as never);
  });

  it("rejects creating a sale at a warehouse outside the caller's scope", async () => {
    await expect(
      saleService.create({
        tenantId: 1n,
        customerId: 30n,
        warehouseId: 10n,
        channel: "POS",
        saleDate: new Date(),
        items: [{ productId: 100n, quantity: "2" }],
        scopedWarehouseId: 999n,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(saleRepository.findCustomerForTenant).not.toHaveBeenCalled();
  });

  it("allows creating a sale at the caller's own scoped warehouse", async () => {
    vi.mocked(saleRepository.create).mockResolvedValue(saleRow() as never);
    vi.mocked(saleRepository.createItem).mockResolvedValue(saleRow().items[0] as never);
    vi.mocked(saleRepository.findDiscountsForSale).mockResolvedValue([]);

    await expect(
      saleService.create({
        tenantId: 1n,
        customerId: 30n,
        warehouseId: 10n,
        channel: "POS",
        saleDate: new Date(),
        items: [{ productId: 100n, quantity: "2" }],
        scopedWarehouseId: 10n,
      }),
    ).resolves.toMatchObject({ warehouseId: "10" });
  });

  it("rejects fetching a sale outside the caller's scoped warehouse", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(saleRow({ warehouseId: 10n }) as never);

    await expect(saleService.getById(1n, 800n, 999n)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("filters list() by the caller's scoped warehouse", async () => {
    vi.mocked(saleRepository.findManyByTenant).mockResolvedValue([]);

    await saleService.list({ tenantId: 1n, scopedWarehouseId: 10n });

    expect(saleRepository.findManyByTenant).toHaveBeenCalledWith(
      1n,
      expect.objectContaining({ warehouseId: 10n }),
    );
  });

  it("rejects confirming a sale outside the caller's scoped warehouse", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(saleRow({ status: "DRAFT" }) as never);

    await expect(saleService.confirm(1n, 800n, 999n)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });

  it("rejects completing a sale outside the caller's scoped warehouse", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(saleRow({ status: "CONFIRMED" }) as never);

    await expect(saleService.complete(1n, 800n, 999n)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("rejects cancelling a sale outside the caller's scoped warehouse", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(saleRow({ status: "DRAFT" }) as never);

    await expect(saleService.cancel(1n, 800n, 999n)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("rejects each fulfillment pipeline step outside the caller's scoped warehouse", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "CONFIRMED" }) as never,
    );

    await expect(saleService.process(1n, 800n, 999n)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(saleService.pack(1n, 800n, 999n)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(saleService.ship(1n, 800n, 999n)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(saleService.deliver(1n, 800n, 999n)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(saleRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("allows a lifecycle action at the caller's own scoped warehouse", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "PENDING_PAYMENT" }) as never,
    );
    vi.mocked(saleRepository.updateStatus).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "CONFIRMED" }) as never,
    );

    await expect(saleService.confirm(1n, 800n, 10n)).resolves.toMatchObject({ status: "CONFIRMED" });
  });
});

describe("saleService.create", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(saleRepository.findCustomerForTenant).mockResolvedValue({
      id: 30n,
      customerGroupId: null,
    } as never);
    vi.mocked(saleRepository.findWarehouseForTenant).mockResolvedValue({ id: 10n } as never);
    vi.mocked(saleRepository.findProductForTenant).mockResolvedValue({
      id: 100n,
      categoryId: null,
    } as never);
    vi.mocked(priceListService.resolvePrice).mockResolvedValue({ priceListId: "1", price: "630" } as never);
    vi.mocked(saleRepository.createItem).mockResolvedValue(saleRow().items[0] as never);
    vi.mocked(saleRepository.findDiscountsForSale).mockResolvedValue([]);
    vi.mocked(promotionService.quote).mockResolvedValue(EMPTY_QUOTE as never);
    vi.mocked(taxService.resolveContext).mockResolvedValue(DEFAULT_TAX_CONTEXT as never);
    vi.mocked(taxService.computeLinesTax).mockResolvedValue(DEFAULT_LINE_TAX as never);
    vi.mocked(saleRepository.findByIdTx).mockResolvedValue(saleRow() as never);
  });

  it("starts a POS sale in COMPLETED and records stock movement", async () => {
    vi.mocked(saleRepository.create).mockResolvedValue(saleRow({ status: "COMPLETED" }) as never);
    vi.mocked(saleRepository.findByIdTx).mockResolvedValue(saleRow({ status: "COMPLETED" }) as never);

    const sale = await saleService.create({
      tenantId: 1n,
      customerId: 30n,
      warehouseId: 10n,
      channel: "POS",
      saleDate: new Date(),
      items: [{ productId: 100n, quantity: "2" }],
    });

    expect(sale.status).toBe("COMPLETED");
    expect(saleRepository.create).toHaveBeenCalledWith(
      "sale-tx",
      expect.objectContaining({ status: "COMPLETED", channel: "POS" }),
    );
  });

  it("starts an ONLINE sale in PENDING_PAYMENT", async () => {
    vi.mocked(saleRepository.create).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "PENDING_PAYMENT" }) as never,
    );
    vi.mocked(saleRepository.findByIdTx).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "PENDING_PAYMENT" }) as never,
    );

    const sale = await saleService.create({
      tenantId: 1n,
      customerId: 30n,
      warehouseId: 10n,
      channel: "ONLINE",
      saleDate: new Date(),
      items: [{ productId: 100n, quantity: "2" }],
    });

    expect(sale.status).toBe("PENDING_PAYMENT");
    expect(saleRepository.create).toHaveBeenCalledWith(
      "sale-tx",
      expect.objectContaining({ status: "PENDING_PAYMENT", channel: "ONLINE" }),
    );
  });

  it("rejects a customer outside the tenant before opening a transaction", async () => {
    vi.mocked(saleRepository.findCustomerForTenant).mockResolvedValue(null);

    await expect(
      saleService.create({
        tenantId: 1n,
        customerId: 999n,
        warehouseId: 10n,
        channel: "POS",
        saleDate: new Date(),
        items: [{ productId: 100n, quantity: "2" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(saleRepository.create).not.toHaveBeenCalled();
  });

  it("rejects creation when customer feature is enabled and customerId is missing", async () => {
    vi.mocked(rbacLookup.isFeatureEnabledForTenant).mockResolvedValue(true);

    await expect(
      saleService.create({
        tenantId: 1n,
        warehouseId: 10n,
        channel: "POS",
        saleDate: new Date(),
        items: [{ productId: 100n, quantity: "2" }],
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Customer is required when customer feature is enabled in your plan",
    });

    expect(saleRepository.create).not.toHaveBeenCalled();
  });

  it("allows creation without customerId when customer feature is NOT enabled", async () => {
    vi.mocked(rbacLookup.isFeatureEnabledForTenant).mockResolvedValue(false);
    vi.mocked(saleRepository.create).mockResolvedValue(saleRow({ customerId: null }) as never);
    vi.mocked(saleRepository.findByIdTx).mockResolvedValue(saleRow({ customerId: null }) as never);

    const sale = await saleService.create({
      tenantId: 1n,
      warehouseId: 10n,
      channel: "POS",
      saleDate: new Date(),
      items: [{ productId: 100n, quantity: "2" }],
    });

    expect(sale.customerId).toBeNull();
    expect(saleRepository.create).toHaveBeenCalledWith(
      "sale-tx",
      expect.objectContaining({ customerId: null }),
    );
  });

  it("passes the coupon code and the customer's group through to the quote, and applies the result inside the transaction", async () => {
    vi.mocked(saleRepository.findCustomerForTenant).mockResolvedValue({
      id: 30n,
      customerGroupId: 5n,
    } as never);
    vi.mocked(saleRepository.create).mockResolvedValue(saleRow({ status: "DRAFT" }) as never);
    const quoteResult = {
      ...EMPTY_QUOTE,
      coupon: { couponId: "1", code: "WELCOME10", amount: "10" },
    };
    vi.mocked(promotionService.quote).mockResolvedValue(quoteResult as never);

    await saleService.create({
      tenantId: 1n,
      customerId: 30n,
      warehouseId: 10n,
      channel: "POS",
      saleDate: new Date(),
      items: [{ productId: 100n, quantity: "2" }],
      couponCode: "WELCOME10",
    });

    expect(promotionService.quote).toHaveBeenCalledWith(
      expect.objectContaining({ couponCode: "WELCOME10", customerGroupId: 5n }),
    );
    expect(promotionService.applyQuoteToSale).toHaveBeenCalledWith(
      "sale-tx",
      expect.objectContaining({ saleId: 800n, quote: quoteResult }),
    );
  });

  it("resolves each item's price server-side instead of trusting a client-supplied one", async () => {
    vi.mocked(saleRepository.create).mockResolvedValue(saleRow({ status: "DRAFT" }) as never);
    vi.mocked(priceListService.resolvePrice).mockResolvedValue({ priceListId: "9", price: "499.00" } as never);

    await saleService.create({
      tenantId: 1n,
      customerId: 30n,
      warehouseId: 10n,
      channel: "POS",
      saleDate: new Date(),
      items: [{ productId: 100n, quantity: "2" }],
    });

    expect(priceListService.resolvePrice).toHaveBeenCalledWith({
      tenantId: 1n,
      productId: 100n,
      warehouseId: 10n,
      quantity: "2",
      customerGroupId: undefined,
      customerId: 30n,
    });
    expect(promotionService.quote).toHaveBeenCalledWith(
      expect.objectContaining({ lines: [expect.objectContaining({ unitPrice: "499.00" })] }),
    );
    expect(saleRepository.createItem).toHaveBeenCalledWith(
      "sale-tx",
      expect.objectContaining({ price: new Prisma.Decimal("499.00") }),
    );
  });

  it("rejects creating a sale when no price list configures an item's product for this warehouse", async () => {
    vi.mocked(priceListService.resolvePrice).mockRejectedValue(
      new AppError("RESOURCE_NOT_FOUND", "No price is configured for this product"),
    );

    await expect(
      saleService.create({
        tenantId: 1n,
        customerId: 30n,
        warehouseId: 10n,
        channel: "POS",
        saleDate: new Date(),
        items: [{ productId: 100n, quantity: "2" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(saleRepository.create).not.toHaveBeenCalled();
  });
});

describe("saleService.create — tax engine", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(saleRepository.findCustomerForTenant).mockResolvedValue({ id: 30n, customerGroupId: null } as never);
    vi.mocked(saleRepository.findWarehouseForTenant).mockResolvedValue({ id: 10n } as never);
    vi.mocked(saleRepository.findProductForTenant).mockResolvedValue({ id: 100n, categoryId: null } as never);
    vi.mocked(priceListService.resolvePrice).mockResolvedValue({ priceListId: "1", price: "630" } as never);
    vi.mocked(saleRepository.create).mockResolvedValue(saleRow({ status: "DRAFT" }) as never);
    vi.mocked(saleRepository.createItem).mockResolvedValue(saleRow().items[0] as never);
    vi.mocked(saleRepository.findDiscountsForSale).mockResolvedValue([]);
    vi.mocked(saleRepository.findByIdTx).mockResolvedValue(saleRow({ status: "DRAFT" }) as never);
    vi.mocked(promotionService.quote).mockResolvedValue({
      ...EMPTY_QUOTE,
      lines: [{ productId: "100", quantity: "2", unitPrice: "630", lineSubtotal: "1260", discounts: [], lineTotal: "1260" }],
      grandTotal: "1260",
    } as never);
    vi.mocked(taxService.resolveContext).mockResolvedValue(DEFAULT_TAX_CONTEXT as never);
  });

  it("computes tax per line via taxService.computeLinesTax and persists the components", async () => {
    vi.mocked(taxService.computeLinesTax).mockResolvedValue([
      {
        taxRateId: "5",
        taxableAmount: "1260",
        components: [
          { component: "CGST", ratePercent: "9", amount: "113.4" },
          { component: "SGST", ratePercent: "9", amount: "113.4" },
        ],
        taxTotal: "226.8",
      },
    ] as never);

    await saleService.create({
      tenantId: 1n,
      customerId: 30n,
      warehouseId: 10n,
      channel: "POS",
      saleDate: new Date(),
      items: [{ productId: 100n, quantity: "2" }],
    });

    expect(taxService.computeLinesTax).toHaveBeenCalledWith(
      1n,
      DEFAULT_TAX_CONTEXT,
      [{ productId: 100n, lineTotal: "1260" }],
    );
    const createItemCall = vi.mocked(saleRepository.createItem).mock.calls[0][1] as { tax: Prisma.Decimal };
    expect(createItemCall.tax.toString()).toBe("226.8");
    expect(saleRepository.createItemTaxes).toHaveBeenCalledWith(
      "sale-tx",
      expect.arrayContaining([
        expect.objectContaining({ component: "CGST", amount: expect.any(Prisma.Decimal) }),
        expect.objectContaining({ component: "SGST", amount: expect.any(Prisma.Decimal) }),
      ]),
    );
  });

  it("propagates a no-tax-rate-configured rejection from the tax engine without creating the sale", async () => {
    vi.mocked(taxService.computeLinesTax).mockRejectedValue(
      Object.assign(new Error("no rate"), { code: "VALIDATION_ERROR" }),
    );

    await expect(
      saleService.create({
        tenantId: 1n,
        customerId: 30n,
        warehouseId: 10n,
        channel: "POS",
        saleDate: new Date(),
        items: [{ productId: 100n, quantity: "2" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(saleRepository.create).not.toHaveBeenCalled();
  });

  it("resolves and attaches extra charges, computing tax on a taxable one", async () => {
    vi.mocked(taxService.computeLinesTax).mockResolvedValue([
      { taxRateId: "5", taxableAmount: "1260", components: [], taxTotal: "0" },
    ] as never);
    vi.mocked(saleRepository.findExtraChargeForTenant).mockResolvedValue({
      id: 7n,
      name: "Shipping",
      calcType: "FLAT",
      value: new Prisma.Decimal("50"),
      isTaxable: true,
      taxRateId: 5n,
    } as never);
    vi.mocked(taxService.computeChargeTax).mockResolvedValue({
      taxRateId: "5",
      taxableAmount: "50",
      components: [{ component: "IGST", ratePercent: "18", amount: "9" }],
      taxTotal: "9",
    } as never);

    await saleService.create({
      tenantId: 1n,
      customerId: 30n,
      warehouseId: 10n,
      channel: "POS",
      saleDate: new Date(),
      items: [{ productId: 100n, quantity: "2" }],
      extraChargeIds: [7n],
    });

    expect(saleRepository.findExtraChargeForTenant).toHaveBeenCalledWith(1n, 7n);
    expect(taxService.computeChargeTax).toHaveBeenCalledWith(1n, DEFAULT_TAX_CONTEXT, { amount: "50", taxRateId: 5n });
    expect(saleRepository.createCharge).toHaveBeenCalledWith(
      "sale-tx",
      expect.objectContaining({ name: "Shipping", taxRateId: 5n }),
    );
  });

  it("rejects an extraChargeId that doesn't belong to this tenant", async () => {
    vi.mocked(taxService.computeLinesTax).mockResolvedValue([
      { taxRateId: "5", taxableAmount: "1260", components: [], taxTotal: "0" },
    ] as never);
    vi.mocked(saleRepository.findExtraChargeForTenant).mockResolvedValue(null);

    await expect(
      saleService.create({
        tenantId: 1n,
        customerId: 30n,
        warehouseId: 10n,
        channel: "POS",
        saleDate: new Date(),
        items: [{ productId: 100n, quantity: "2" }],
        extraChargeIds: [999n],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(saleRepository.create).not.toHaveBeenCalled();
  });
});

describe("saleService.confirm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("decrements stock per item and moves a PENDING_PAYMENT ONLINE sale to CONFIRMED", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "PENDING_PAYMENT" }) as never,
    );
    vi.mocked(saleRepository.updateStatus).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "CONFIRMED" }) as never,
    );

    const sale = await saleService.confirm(1n, 800n);

    expect(sale.status).toBe("CONFIRMED");
    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: 10n,
        productId: 100n,
        transactionType: "SALE_OUT",
        quantityDelta: "-2",
        referenceType: "SALE",
        referenceId: 800n,
      }),
      "sale-tx",
    );
  });

  it("rejects confirming a sale not in its channel's initial status", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(
      saleRow({ status: "CONFIRMED" }) as never,
    );

    await expect(saleService.confirm(1n, 800n)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });

  it("propagates an insufficient-stock rejection from the inventory module without confirming", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "PENDING_PAYMENT" }) as never,
    );
    vi.mocked(inventoryService.recordMovement).mockRejectedValue(
      Object.assign(new Error("no stock"), { code: "INSUFFICIENT_STOCK" }),
    );

    await expect(saleService.confirm(1n, 800n)).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
    });
    expect(saleRepository.updateStatus).not.toHaveBeenCalled();
  });
});

describe("saleService.complete", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects completing a sale that isn't CONFIRMED", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(saleRow({ status: "DRAFT" }) as never);

    await expect(saleService.complete(1n, 800n)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects completing a non-POS sale (it uses the fulfillment pipeline instead)", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "CONFIRMED" }) as never,
    );

    await expect(saleService.complete(1n, 800n)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});

describe("saleService — online fulfillment pipeline", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("walks CONFIRMED -> PROCESSING -> PACKED -> SHIPPED -> DELIVERED with no inventory movement", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "CONFIRMED" }) as never,
    );
    vi.mocked(saleRepository.updateStatus).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "PROCESSING" }) as never,
    );

    const processed = await saleService.process(1n, 800n);

    expect(processed.status).toBe("PROCESSING");
    expect(saleRepository.updateStatus).toHaveBeenCalledWith(expect.anything(), 800n, "PROCESSING");
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });

  it("rejects packing a sale that hasn't been processed yet", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "CONFIRMED" }) as never,
    );

    await expect(saleService.pack(1n, 800n)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(saleRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("rejects shipping a sale that's only PROCESSING (must be PACKED first)", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "PROCESSING" }) as never,
    );

    await expect(saleService.ship(1n, 800n)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("advances PACKED to SHIPPED and SHIPPED to DELIVERED", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "PACKED" }) as never,
    );
    vi.mocked(saleRepository.updateStatus).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "SHIPPED" }) as never,
    );

    const shipped = await saleService.ship(1n, 800n);
    expect(shipped.status).toBe("SHIPPED");

    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "SHIPPED" }) as never,
    );
    vi.mocked(saleRepository.updateStatus).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "DELIVERED" }) as never,
    );

    const delivered = await saleService.deliver(1n, 800n);
    expect(delivered.status).toBe("DELIVERED");
  });

  it("rejects the fulfillment pipeline entirely for a POS sale", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(
      saleRow({ channel: "POS", status: "CONFIRMED" }) as never,
    );

    await expect(saleService.process(1n, 800n)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("saleService.cancel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("cancels a DRAFT sale with no inventory reversal", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(saleRow({ status: "DRAFT" }) as never);
    vi.mocked(saleRepository.updateStatus).mockResolvedValue(saleRow({ status: "CANCELLED" }) as never);

    const sale = await saleService.cancel(1n, 800n);

    expect(sale.status).toBe("CANCELLED");
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });

  it("reverses stock with a positive SALE_RETURN_IN movement when cancelling a CONFIRMED sale", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(
      saleRow({ status: "CONFIRMED" }) as never,
    );
    vi.mocked(saleRepository.updateStatus).mockResolvedValue(saleRow({ status: "CANCELLED" }) as never);

    const sale = await saleService.cancel(1n, 800n);

    expect(sale.status).toBe("CANCELLED");
    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionType: "SALE_RETURN_IN",
        quantityDelta: "2",
        referenceType: "SALE",
        referenceId: 800n,
      }),
      "sale-tx",
    );
  });

  it("reverses stock when cancelling a COMPLETED sale", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(
      saleRow({ status: "COMPLETED" }) as never,
    );
    vi.mocked(saleRepository.updateStatus).mockResolvedValue(
      saleRow({ status: "CANCELLED" }) as never,
    );

    const sale = await saleService.cancel(1n, 800n);

    expect(sale.status).toBe("CANCELLED");
    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({ transactionType: "SALE_RETURN_IN" }),
      "sale-tx",
    );
  });

  it("still reverses stock when cancelling a PACKED sale (stock left at confirm, well before packing)", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "PACKED" }) as never,
    );
    vi.mocked(saleRepository.updateStatus).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "CANCELLED" }) as never,
    );

    const sale = await saleService.cancel(1n, 800n);

    expect(sale.status).toBe("CANCELLED");
    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({ transactionType: "SALE_RETURN_IN" }),
      "sale-tx",
    );
  });

  it("rejects cancelling a SHIPPED sale — use a SaleReturn instead", async () => {
    vi.mocked(saleRepository.findByIdForTenant).mockResolvedValue(
      saleRow({ channel: "ONLINE", status: "SHIPPED" }) as never,
    );

    await expect(saleService.cancel(1n, 800n)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });
});
