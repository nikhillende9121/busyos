import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../repository/coupon.repository", () => ({
  couponRepository: {
    create: vi.fn(),
    findProductForTenant: vi.fn(),
    findCategoryForTenant: vi.fn(),
    findWarehouseForTenant: vi.fn(),
    findCustomerGroupForTenant: vi.fn(),
    findCustomerForTenant: vi.fn(),
    linkProduct: vi.fn(),
    linkCategory: vi.fn(),
  },
}));

import { couponRepository } from "../repository/coupon.repository";
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
});
