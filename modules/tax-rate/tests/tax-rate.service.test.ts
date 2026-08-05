import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../repository/tax-rate.repository", () => ({
  taxRateRepository: {
    findManyByTenant: vi.fn(),
    findByIdForTenant: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    hasProductsUsingRate: vi.fn(),
  },
}));

import { taxRateRepository } from "../repository/tax-rate.repository";
import { taxRateService } from "../service/tax-rate.service";

function taxRateRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1n,
    tenantId: 1n,
    name: "GST 18%",
    hsnCode: "1006",
    sacCode: null,
    ratePercent: new Prisma.Decimal("18.00"),
    cessPercent: new Prisma.Decimal("0"),
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("taxRateService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a tax rate with the given rate/cess percentages", async () => {
    vi.mocked(taxRateRepository.create).mockResolvedValue(taxRateRow() as never);

    const rate = await taxRateService.create({
      tenantId: 1n,
      name: "GST 18%",
      hsnCode: "1006",
      ratePercent: "18.00",
    });

    expect(rate).toMatchObject({ name: "GST 18%", ratePercent: "18", cessPercent: "0" });
    expect(taxRateRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ ratePercent: expect.any(Prisma.Decimal) }),
    );
  });
});

describe("taxRateService.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(taxRateRepository.findByIdForTenant).mockResolvedValue(taxRateRow() as never);
  });

  it("rejects updating a tax rate outside the tenant", async () => {
    vi.mocked(taxRateRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(
      taxRateService.update({ tenantId: 1n, taxRateId: 999n, name: "New name" }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("updates the rate percentage", async () => {
    vi.mocked(taxRateRepository.update).mockResolvedValue(
      taxRateRow({ ratePercent: new Prisma.Decimal("28.00") }) as never,
    );

    const rate = await taxRateService.update({ tenantId: 1n, taxRateId: 1n, ratePercent: "28.00" });

    expect(rate.ratePercent).toBe("28");
  });
});

describe("taxRateService.remove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(taxRateRepository.findByIdForTenant).mockResolvedValue(taxRateRow() as never);
  });

  it("blocks deletion when one or more products still use this rate", async () => {
    vi.mocked(taxRateRepository.hasProductsUsingRate).mockResolvedValue(true);

    await expect(taxRateService.remove(1n, 1n)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(taxRateRepository.softDelete).not.toHaveBeenCalled();
  });

  it("soft-deletes a tax rate with no products assigned", async () => {
    vi.mocked(taxRateRepository.hasProductsUsingRate).mockResolvedValue(false);

    await taxRateService.remove(1n, 1n, 42n);

    expect(taxRateRepository.softDelete).toHaveBeenCalledWith(1n, 42n);
  });

  it("throws RESOURCE_NOT_FOUND instead of checking dependents for a rate outside the tenant", async () => {
    vi.mocked(taxRateRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(taxRateService.remove(1n, 999n)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect(taxRateRepository.hasProductsUsingRate).not.toHaveBeenCalled();
  });
});
