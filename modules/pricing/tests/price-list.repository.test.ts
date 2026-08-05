import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/shared/database/prisma", () => ({
  prisma: {
    priceList: { findFirst: vi.fn() },
    priceListItem: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/shared/database/prisma";
import { priceListRepository } from "../repository/price-list.repository";

describe("priceListRepository.resolve", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("prefers a customer-specific price list, checking only that tier when it hits", async () => {
    vi.mocked(prisma.priceList.findFirst).mockResolvedValueOnce({ id: 1n } as never);
    vi.mocked(prisma.priceListItem.findFirst).mockResolvedValueOnce({
      price: new Prisma.Decimal("999"),
    } as never);

    const result = await priceListRepository.resolve({
      tenantId: 1n,
      productId: 100n,
      customerId: 50n,
      quantity: new Prisma.Decimal("1"),
    });

    expect(result).toEqual({ priceListId: 1n, price: new Prisma.Decimal("999") });
    expect(prisma.priceList.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.priceList.findFirst).toHaveBeenCalledWith({ where: { tenantId: 1n, customerId: 50n } });
  });

  it("checks the warehouse-only tier before the customer-group-only tier", async () => {
    vi.mocked(prisma.priceList.findFirst)
      .mockResolvedValueOnce(null) // warehouse+group combo — no match
      .mockResolvedValueOnce({ id: 7n } as never); // warehouse-only — match
    vi.mocked(prisma.priceListItem.findFirst).mockResolvedValueOnce({
      price: new Prisma.Decimal("300"),
    } as never);

    const result = await priceListRepository.resolve({
      tenantId: 1n,
      productId: 100n,
      warehouseId: 10n,
      customerGroupId: 20n,
      quantity: new Prisma.Decimal("5"),
    });

    expect(result).toEqual({ priceListId: 7n, price: new Prisma.Decimal("300") });
    expect(prisma.priceList.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.priceList.findFirst).toHaveBeenNthCalledWith(2, {
      where: { tenantId: 1n, warehouseId: 10n, customerGroupId: null },
    });
  });

  it("falls through to the next tier when a matched price list has no item for the product", async () => {
    vi.mocked(prisma.priceList.findFirst)
      .mockResolvedValueOnce({ id: 2n } as never) // combo — matches
      .mockResolvedValueOnce({ id: 3n } as never); // warehouse-only — matches
    vi.mocked(prisma.priceListItem.findFirst)
      .mockResolvedValueOnce(null) // no item on list 2
      .mockResolvedValueOnce({ price: new Prisma.Decimal("500") } as never); // item found on list 3

    const result = await priceListRepository.resolve({
      tenantId: 1n,
      productId: 100n,
      warehouseId: 10n,
      customerGroupId: 20n,
      quantity: new Prisma.Decimal("1"),
    });

    expect(result).toEqual({ priceListId: 3n, price: new Prisma.Decimal("500") });
    expect(prisma.priceListItem.findFirst).toHaveBeenCalledTimes(2);
  });

  it("falls back to the tenant default when nothing more specific matches", async () => {
    vi.mocked(prisma.priceList.findFirst)
      .mockResolvedValueOnce(null) // combo
      .mockResolvedValueOnce(null) // warehouse-only
      .mockResolvedValueOnce(null) // group-only
      .mockResolvedValueOnce({ id: 9n } as never); // tenant default
    vi.mocked(prisma.priceListItem.findFirst).mockResolvedValueOnce({
      price: new Prisma.Decimal("100"),
    } as never);

    const result = await priceListRepository.resolve({
      tenantId: 1n,
      productId: 100n,
      warehouseId: 10n,
      customerGroupId: 20n,
      quantity: new Prisma.Decimal("1"),
    });

    expect(result).toEqual({ priceListId: 9n, price: new Prisma.Decimal("100") });
    expect(prisma.priceList.findFirst).toHaveBeenCalledTimes(4);
    expect(prisma.priceList.findFirst).toHaveBeenLastCalledWith({
      where: { tenantId: 1n, isDefault: true },
    });
  });

  it("returns null when no tier matches at all", async () => {
    vi.mocked(prisma.priceList.findFirst).mockResolvedValue(null);

    const result = await priceListRepository.resolve({
      tenantId: 1n,
      productId: 100n,
      quantity: new Prisma.Decimal("1"),
    });

    expect(result).toBeNull();
  });

  it("picks the item with the largest minQuantity not exceeding the requested quantity", async () => {
    vi.mocked(prisma.priceList.findFirst).mockResolvedValueOnce({ id: 1n } as never);
    // findBestItem's own where/orderBy expresses "largest minQuantity <= quantity";
    // this test just confirms resolve() passes the requested quantity through.
    vi.mocked(prisma.priceListItem.findFirst).mockImplementationOnce(((args: {
      where: { minQuantity: { lte: Prisma.Decimal } };
    }) => {
      expect(args.where.minQuantity.lte.toString()).toBe("12");
      return Promise.resolve({ price: new Prisma.Decimal("90") });
    }) as never);

    const result = await priceListRepository.resolve({
      tenantId: 1n,
      productId: 100n,
      customerId: 50n,
      quantity: new Prisma.Decimal("12"),
    });

    expect(result).toEqual({ priceListId: 1n, price: new Prisma.Decimal("90") });
  });
});
