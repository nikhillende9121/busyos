import "dotenv/config";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../repository/discount.repository", () => ({
  discountRepository: {
    findApplicableForProduct: vi.fn(),
  },
}));

vi.mock("../repository/coupon.repository", () => ({
  couponRepository: {
    findActiveByCode: vi.fn(),
    lockCoupon: vi.fn(),
    countRedemptions: vi.fn(),
    countRedemptionsByCustomer: vi.fn(),
    createRedemption: vi.fn(),
  },
}));

vi.mock("@/modules/sales/service/sale.service", () => ({
  resolveSaleCharges: vi.fn().mockResolvedValue([]),
}));

import { discountRepository } from "../repository/discount.repository";
import { couponRepository } from "../repository/coupon.repository";
import { promotionService } from "../service/promotion.service";

function discountRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1n,
    tenantId: 1n,
    name: "Test Discount",
    type: "PERCENTAGE",
    value: new Prisma.Decimal("10"),
    scope: "ORDER",
    warehouseId: null,
    customerGroupId: null,
    customerId: null,
    minPurchaseAmount: null,
    maxDiscountAmount: null,
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: null,
    isActive: true,
    stackable: false,
    priority: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function couponRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 5n,
    tenantId: 1n,
    code: "SAVE10",
    type: "FLAT",
    value: new Prisma.Decimal("10"),
    scope: "ORDER",
    warehouseId: null,
    customerGroupId: null,
    customerId: null,
    minPurchaseAmount: null,
    maxDiscountAmount: null,
    usageLimitTotal: null,
    usageLimitPerCustomer: null,
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: null,
    isActive: true,
    stackable: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    products: [] as { couponId: bigint; productId: bigint }[],
    categories: [] as { couponId: bigint; categoryId: bigint }[],
    ...overrides,
  };
}

const oneLine = (overrides: Partial<Record<string, unknown>> = {}) => ({
  tenantId: 1n,
  warehouseId: 10n,
  customerId: 30n,
  lines: [{ productId: 100n, quantity: "2", unitPrice: "100" }],
  ...overrides,
});

describe("promotionService.quote — discounts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the full subtotal as lineTotal when nothing is applicable", async () => {
    vi.mocked(discountRepository.findApplicableForProduct).mockResolvedValue([]);

    const result = await promotionService.quote(oneLine());

    expect(result.lines[0]).toMatchObject({ lineSubtotal: "200", discounts: [], lineTotal: "200" });
    expect(result.grandTotal).toBe("200");
  });

  it("applies a single non-stackable PERCENTAGE discount", async () => {
    vi.mocked(discountRepository.findApplicableForProduct).mockResolvedValue([
      discountRow({ type: "PERCENTAGE", value: new Prisma.Decimal("10") }),
    ] as never);

    const result = await promotionService.quote(oneLine());

    // 200 subtotal, 10% off = 20
    expect(result.lines[0].discounts).toEqual([{ discountId: "1", name: "Test Discount", amount: "20" }]);
    expect(result.lines[0].lineTotal).toBe("180");
  });

  it("picks only the single highest-value discount among non-stackable candidates", async () => {
    vi.mocked(discountRepository.findApplicableForProduct).mockResolvedValue([
      discountRow({ id: 1n, name: "Small", type: "FLAT", value: new Prisma.Decimal("5") }),
      discountRow({ id: 2n, name: "Big", type: "FLAT", value: new Prisma.Decimal("50") }),
    ] as never);

    const result = await promotionService.quote(oneLine());

    expect(result.lines[0].discounts).toEqual([{ discountId: "2", name: "Big", amount: "50" }]);
    expect(result.lines[0].lineTotal).toBe("150");
  });

  it("applies stackable discounts sequentially off the running amount, not the original subtotal", async () => {
    vi.mocked(discountRepository.findApplicableForProduct).mockResolvedValue([
      discountRow({ id: 1n, name: "First", type: "PERCENTAGE", value: new Prisma.Decimal("50"), stackable: true, priority: 0 }),
      discountRow({ id: 2n, name: "Second", type: "PERCENTAGE", value: new Prisma.Decimal("50"), stackable: true, priority: 1 }),
    ] as never);

    const result = await promotionService.quote(oneLine());

    // 200 -> 50% off -> 100 -> 50% off the remaining 100 -> 50 (NOT 200 - 100 - 100 = 0)
    expect(result.lines[0].discounts).toEqual([
      { discountId: "1", name: "First", amount: "100" },
      { discountId: "2", name: "Second", amount: "50" },
    ]);
    expect(result.lines[0].lineTotal).toBe("50");
  });

  it("caps a discount at maxDiscountAmount", async () => {
    vi.mocked(discountRepository.findApplicableForProduct).mockResolvedValue([
      discountRow({ type: "PERCENTAGE", value: new Prisma.Decimal("50"), maxDiscountAmount: new Prisma.Decimal("30") }),
    ] as never);

    const result = await promotionService.quote(oneLine());

    // 50% of 200 would be 100, capped at 30
    expect(result.lines[0].discounts[0].amount).toBe("30");
    expect(result.lines[0].lineTotal).toBe("170");
  });

  it("never lets a line's discounts exceed its own subtotal", async () => {
    vi.mocked(discountRepository.findApplicableForProduct).mockResolvedValue([
      discountRow({ type: "FLAT", value: new Prisma.Decimal("500") }),
    ] as never);

    const result = await promotionService.quote(oneLine());

    expect(result.lines[0].discounts[0].amount).toBe("200");
    expect(result.lines[0].lineTotal).toBe("0");
  });
});

describe("promotionService.quote — coupons", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(discountRepository.findApplicableForProduct).mockResolvedValue([]);
  });

  it("rejects an unknown or expired coupon code", async () => {
    vi.mocked(couponRepository.findActiveByCode).mockResolvedValue(null);

    await expect(promotionService.quote(oneLine({ couponCode: "NOPE" }))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects a coupon scoped to a different warehouse", async () => {
    vi.mocked(couponRepository.findActiveByCode).mockResolvedValue(
      couponRow({ warehouseId: 999n }) as never,
    );

    await expect(promotionService.quote(oneLine({ couponCode: "SAVE10" }))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects a coupon when the order doesn't meet minPurchaseAmount (checked pre-discount)", async () => {
    vi.mocked(couponRepository.findActiveByCode).mockResolvedValue(
      couponRow({ minPurchaseAmount: new Prisma.Decimal("500") }) as never,
    );

    await expect(promotionService.quote(oneLine({ couponCode: "SAVE10" }))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("applies a valid FLAT coupon to the grand total", async () => {
    vi.mocked(couponRepository.findActiveByCode).mockResolvedValue(couponRow() as never);

    const result = await promotionService.quote(oneLine({ couponCode: "SAVE10" }));

    expect(result.coupon).toEqual({ couponId: "5", code: "SAVE10", amount: "10" });
    expect(result.grandTotal).toBe("190");
  });

  it("computes a PERCENTAGE coupon off the post-line-discount total, not the original subtotal", async () => {
    vi.mocked(discountRepository.findApplicableForProduct).mockResolvedValue([
      discountRow({ type: "FLAT", value: new Prisma.Decimal("50") }),
    ] as never);
    vi.mocked(couponRepository.findActiveByCode).mockResolvedValue(
      couponRow({ type: "PERCENTAGE", value: new Prisma.Decimal("10") }) as never,
    );

    const result = await promotionService.quote(oneLine({ couponCode: "SAVE10" }));

    // subtotal 200, line discount 50 -> 150; coupon 10% of 150 = 15
    expect(result.coupon?.amount).toBe("15");
    expect(result.grandTotal).toBe("135");
  });

  it("caps a coupon at maxDiscountAmount", async () => {
    vi.mocked(couponRepository.findActiveByCode).mockResolvedValue(
      couponRow({ type: "PERCENTAGE", value: new Prisma.Decimal("90"), maxDiscountAmount: new Prisma.Decimal("20") }) as never,
    );

    const result = await promotionService.quote(oneLine({ couponCode: "SAVE10" }));

    expect(result.coupon?.amount).toBe("20");
  });
});

describe("promotionService.quote — PRODUCT/CATEGORY-scoped coupons", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(discountRepository.findApplicableForProduct).mockResolvedValue([]);
  });

  it("reduces only the matching product's line, leaving other lines untouched", async () => {
    vi.mocked(couponRepository.findActiveByCode).mockResolvedValue(
      couponRow({
        scope: "PRODUCT",
        type: "FLAT",
        value: new Prisma.Decimal("15"),
        products: [{ couponId: 5n, productId: 100n }],
      }) as never,
    );

    const result = await promotionService.quote(
      oneLine({
        couponCode: "SAVE10",
        lines: [
          { productId: 100n, quantity: "2", unitPrice: "100" }, // matches
          { productId: 200n, quantity: "1", unitPrice: "50" }, // doesn't match
        ],
      }),
    );

    expect(result.lines[0].discounts).toEqual([{ couponId: "5", name: "SAVE10", amount: "15" }]);
    expect(result.lines[0].lineTotal).toBe("185");
    expect(result.lines[1].discounts).toEqual([]);
    expect(result.lines[1].lineTotal).toBe("50");
    expect(result.coupon).toEqual({ couponId: "5", code: "SAVE10", amount: "15" });
    // subtotal 250, only the matched line's 15 reduced -> 235
    expect(result.grandTotal).toBe("235");
  });

  it("rejects a PRODUCT-scoped coupon that matches nothing in the order", async () => {
    vi.mocked(couponRepository.findActiveByCode).mockResolvedValue(
      couponRow({ scope: "PRODUCT", products: [{ couponId: 5n, productId: 999n }] }) as never,
    );

    await expect(promotionService.quote(oneLine({ couponCode: "SAVE10" }))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("matches a CATEGORY-scoped coupon against the line's categoryId", async () => {
    vi.mocked(couponRepository.findActiveByCode).mockResolvedValue(
      couponRow({
        scope: "CATEGORY",
        type: "FLAT",
        value: new Prisma.Decimal("20"),
        categories: [{ couponId: 5n, categoryId: 7n }],
      }) as never,
    );

    const result = await promotionService.quote(
      oneLine({
        couponCode: "SAVE10",
        lines: [{ productId: 100n, categoryId: 7n, quantity: "1", unitPrice: "100" }],
      }),
    );

    expect(result.lines[0].discounts).toEqual([{ couponId: "5", name: "SAVE10", amount: "20" }]);
    expect(result.coupon?.amount).toBe("20");
  });

  it("sums the reduction across every line a PRODUCT-scoped coupon matches", async () => {
    vi.mocked(couponRepository.findActiveByCode).mockResolvedValue(
      couponRow({
        scope: "PRODUCT",
        type: "FLAT",
        value: new Prisma.Decimal("10"),
        products: [
          { couponId: 5n, productId: 100n },
          { couponId: 5n, productId: 200n },
        ],
      }) as never,
    );

    const result = await promotionService.quote(
      oneLine({
        couponCode: "SAVE10",
        lines: [
          { productId: 100n, quantity: "1", unitPrice: "100" },
          { productId: 200n, quantity: "1", unitPrice: "50" },
        ],
      }),
    );

    expect(result.coupon?.amount).toBe("20");
    expect(result.grandTotal).toBe("130");
  });
});

describe("promotionService.applyQuoteToSale", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function fakeTx() {
    return {
      saleDiscount: { create: vi.fn() },
      coupon: { findUniqueOrThrow: vi.fn() },
    };
  }

  it("persists a SaleDiscount per line discount, linked to the right saleItemId", async () => {
    const tx = fakeTx();
    const quote = {
      lines: [
        {
          productId: "100",
          quantity: "2",
          unitPrice: "100",
          lineSubtotal: "200",
          discounts: [{ discountId: "1", name: "Test", amount: "20" }],
          lineTotal: "180",
        },
      ],
      subtotal: "200",
      lineDiscountTotal: "20",
      coupon: null,
      grandTotal: "180",
    };

    await promotionService.applyQuoteToSale(tx as never, {
      tenantId: 1n,
      saleId: 800n,
      customerId: 30n,
      quote,
      saleItemIdByProductId: new Map([["100", 900n]]),
    });

    expect(tx.saleDiscount.create).toHaveBeenCalledWith({
      data: { tenantId: 1n, saleId: 800n, saleItemId: 900n, discountId: 1n, amount: new Prisma.Decimal("20") },
    });
    expect(couponRepository.lockCoupon).not.toHaveBeenCalled();
  });

  it("does nothing coupon-related when the quote has no coupon", async () => {
    const tx = fakeTx();
    await promotionService.applyQuoteToSale(tx as never, {
      tenantId: 1n,
      saleId: 800n,
      quote: { lines: [], subtotal: "0", lineDiscountTotal: "0", coupon: null, grandTotal: "0" },
      saleItemIdByProductId: new Map(),
    });

    expect(couponRepository.createRedemption).not.toHaveBeenCalled();
  });

  it("locks the coupon and rejects when the total usage limit has been reached", async () => {
    const tx = fakeTx();
    tx.coupon.findUniqueOrThrow.mockResolvedValue(couponRow({ usageLimitTotal: 100 }) as never);
    vi.mocked(couponRepository.countRedemptions).mockResolvedValue(100);

    await expect(
      promotionService.applyQuoteToSale(tx as never, {
        tenantId: 1n,
        saleId: 800n,
        customerId: 30n,
        quote: {
          lines: [],
          subtotal: "200",
          lineDiscountTotal: "0",
          coupon: { couponId: "5", code: "SAVE10", amount: "10" },
          grandTotal: "190",
        },
        saleItemIdByProductId: new Map(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(couponRepository.lockCoupon).toHaveBeenCalledWith(tx, 5n);
    expect(couponRepository.createRedemption).not.toHaveBeenCalled();
  });

  it("rejects when this customer has already redeemed up to their per-customer limit", async () => {
    const tx = fakeTx();
    tx.coupon.findUniqueOrThrow.mockResolvedValue(couponRow({ usageLimitPerCustomer: 1 }) as never);
    vi.mocked(couponRepository.countRedemptionsByCustomer).mockResolvedValue(1);

    await expect(
      promotionService.applyQuoteToSale(tx as never, {
        tenantId: 1n,
        saleId: 800n,
        customerId: 30n,
        quote: {
          lines: [],
          subtotal: "200",
          lineDiscountTotal: "0",
          coupon: { couponId: "5", code: "SAVE10", amount: "10" },
          grandTotal: "190",
        },
        saleItemIdByProductId: new Map(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(couponRepository.createRedemption).not.toHaveBeenCalled();
  });

  it("rejects when the coupon is no longer active by the time of commit", async () => {
    const tx = fakeTx();
    tx.coupon.findUniqueOrThrow.mockResolvedValue(couponRow({ isActive: false }) as never);

    await expect(
      promotionService.applyQuoteToSale(tx as never, {
        tenantId: 1n,
        saleId: 800n,
        customerId: 30n,
        quote: {
          lines: [],
          subtotal: "200",
          lineDiscountTotal: "0",
          coupon: { couponId: "5", code: "SAVE10", amount: "10" },
          grandTotal: "190",
        },
        saleItemIdByProductId: new Map(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("creates the redemption and a coupon SaleDiscount when under every limit", async () => {
    const tx = fakeTx();
    tx.coupon.findUniqueOrThrow.mockResolvedValue(couponRow({ usageLimitTotal: 100 }) as never);
    vi.mocked(couponRepository.countRedemptions).mockResolvedValue(5);

    await promotionService.applyQuoteToSale(tx as never, {
      tenantId: 1n,
      saleId: 800n,
      customerId: 30n,
      quote: {
        lines: [],
        subtotal: "200",
        lineDiscountTotal: "0",
        coupon: { couponId: "5", code: "SAVE10", amount: "10" },
        grandTotal: "190",
      },
      saleItemIdByProductId: new Map(),
    });

    expect(couponRepository.createRedemption).toHaveBeenCalledWith(tx, {
      couponId: 5n,
      tenantId: 1n,
      customerId: 30n,
      saleId: 800n,
      amountDiscounted: new Prisma.Decimal("10"),
    });
    expect(tx.saleDiscount.create).toHaveBeenCalledWith({
      data: { tenantId: 1n, saleId: 800n, couponId: 5n, amount: new Prisma.Decimal("10") },
    });
  });

  it("does not create a duplicate order-level SaleDiscount for a PRODUCT-scoped coupon (already recorded per line)", async () => {
    const tx = fakeTx();
    tx.coupon.findUniqueOrThrow.mockResolvedValue(couponRow({ scope: "PRODUCT" }) as never);

    await promotionService.applyQuoteToSale(tx as never, {
      tenantId: 1n,
      saleId: 800n,
      customerId: 30n,
      quote: {
        lines: [
          {
            productId: "100",
            quantity: "2",
            unitPrice: "100",
            lineSubtotal: "200",
            discounts: [{ couponId: "5", name: "SAVE10", amount: "15" }],
            lineTotal: "185",
          },
        ],
        subtotal: "200",
        lineDiscountTotal: "15",
        coupon: { couponId: "5", code: "SAVE10", amount: "15" },
        grandTotal: "185",
      },
      saleItemIdByProductId: new Map([["100", 900n]]),
    });

    // One create call for the per-line coupon reduction, none for an
    // order-level row — createRedemption still happens regardless of scope.
    expect(tx.saleDiscount.create).toHaveBeenCalledTimes(1);
    expect(tx.saleDiscount.create).toHaveBeenCalledWith({
      data: { tenantId: 1n, saleId: 800n, saleItemId: 900n, discountId: undefined, couponId: 5n, amount: new Prisma.Decimal("15") },
    });
    expect(couponRepository.createRedemption).toHaveBeenCalled();
  });
});
