import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../repository/coupon.repository", () => ({
  couponRepository: {
    create: vi.fn(),
    findManyByTenant: vi.fn(),
    countByTenant: vi.fn(),
    findProductForTenant: vi.fn(),
    findCategoryForTenant: vi.fn(),
    findWarehouseForTenant: vi.fn(),
    findCustomerGroupForTenant: vi.fn(),
    findCustomerForTenant: vi.fn(),
    linkProduct: vi.fn(),
    linkCategory: vi.fn(),
  },
}));

vi.mock("@/modules/webhook/service/webhook.service", () => ({
  webhookService: { enqueueEvent: vi.fn() },
}));

import { couponRepository } from "../repository/coupon.repository";
import { webhookService } from "@/modules/webhook/service/webhook.service";
import { couponService } from "../service/coupon.service";

describe("couponService.create", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("maps a duplicate coupon code to DUPLICATE_CODE", async () => {
    vi.mocked(couponRepository.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["tenantId", "code"] },
      }),
    );

    await expect(
      couponService.create({
        tenantId: 1n,
        code: "SAVE10",
        type: "FLAT",
        value: "10",
        scope: "ORDER",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_CODE" });
  });

  it("rejects a productId outside the tenant before creating the coupon", async () => {
    vi.mocked(couponRepository.findProductForTenant).mockResolvedValue(null);

    await expect(
      couponService.create({
        tenantId: 1n,
        code: "SAVE10",
        type: "FLAT",
        value: "10",
        scope: "PRODUCT",
        productIds: [999n],
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(couponRepository.create).not.toHaveBeenCalled();
  });

  it("enqueues a COUPON_CREATED webhook event on success", async () => {
    vi.mocked(couponRepository.create).mockResolvedValue({
      id: 1n,
      tenantId: 1n,
      code: "SAVE10",
      type: "FLAT",
      value: { toString: () => "10" },
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
    } as never);

    await couponService.create({
      tenantId: 1n,
      code: "SAVE10",
      type: "FLAT",
      value: "10",
      scope: "ORDER",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(webhookService.enqueueEvent).toHaveBeenCalledWith(1n, "COUPON_CREATED", expect.anything());
  });
});

describe("couponService.list — pagination & date filter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(couponRepository.findManyByTenant).mockResolvedValue([]);
    vi.mocked(couponRepository.countByTenant).mockResolvedValue(45);
  });

  it("computes skip from page and pageSize, and returns pagination built from the count", async () => {
    const result = await couponService.list({ tenantId: 1n, page: 3, pageSize: 20 });

    expect(couponRepository.findManyByTenant).toHaveBeenCalledWith(
      1n,
      expect.objectContaining({ skip: 40, take: 20 }),
    );
    expect(result.pagination).toEqual({ page: 3, pageSize: 20, total: 45, totalPages: 3 });
  });

  it("passes dateFrom/dateTo through to the repository", async () => {
    const dateFrom = new Date("2026-01-01T00:00:00.000Z");
    const dateTo = new Date("2026-01-31T00:00:00.000Z");

    await couponService.list({ tenantId: 1n, page: 1, pageSize: 20, dateFrom, dateTo });

    expect(couponRepository.findManyByTenant).toHaveBeenCalledWith(1n, expect.objectContaining({ dateFrom, dateTo }));
    expect(couponRepository.countByTenant).toHaveBeenCalledWith(1n, expect.objectContaining({ dateFrom, dateTo }));
  });
});

describe("couponService.exportList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches every matching row with no skip/take", async () => {
    vi.mocked(couponRepository.findManyByTenant).mockResolvedValue([]);
    const dateFrom = new Date("2026-01-01T00:00:00.000Z");

    await couponService.exportList({ tenantId: 1n, dateFrom });

    const callArgs = vi.mocked(couponRepository.findManyByTenant).mock.calls[0][1] as Record<string, unknown>;
    expect(callArgs).toMatchObject({ dateFrom });
    expect(callArgs.skip).toBeUndefined();
    expect(callArgs.take).toBeUndefined();
    expect(couponRepository.countByTenant).not.toHaveBeenCalled();
  });
});
