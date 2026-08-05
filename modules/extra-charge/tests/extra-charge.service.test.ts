import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../repository/extra-charge.repository", () => ({
  extraChargeRepository: {
    findManyByTenant: vi.fn(),
    findByIdForTenant: vi.fn(),
    findTaxRateForTenant: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
}));

import { extraChargeRepository } from "../repository/extra-charge.repository";
import { extraChargeService } from "../service/extra-charge.service";

function chargeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1n,
    tenantId: 1n,
    name: "Shipping",
    calcType: "FLAT",
    value: new Prisma.Decimal("50.00"),
    isTaxable: false,
    taxRateId: null,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("extraChargeService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a non-taxable flat charge with no taxRateId required", async () => {
    vi.mocked(extraChargeRepository.create).mockResolvedValue(chargeRow() as never);

    const charge = await extraChargeService.create({
      tenantId: 1n,
      name: "Shipping",
      calcType: "FLAT",
      value: "50.00",
    });

    expect(charge).toMatchObject({ name: "Shipping", isTaxable: false, taxRateId: null });
    expect(extraChargeRepository.findTaxRateForTenant).not.toHaveBeenCalled();
  });

  it("rejects a taxable charge with no taxRateId", async () => {
    await expect(
      extraChargeService.create({ tenantId: 1n, name: "Packing", calcType: "FLAT", value: "20", isTaxable: true }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(extraChargeRepository.create).not.toHaveBeenCalled();
  });

  it("rejects a taxRateId that doesn't belong to this tenant", async () => {
    vi.mocked(extraChargeRepository.findTaxRateForTenant).mockResolvedValue(null);

    await expect(
      extraChargeService.create({
        tenantId: 1n,
        name: "Packing",
        calcType: "FLAT",
        value: "20",
        isTaxable: true,
        taxRateId: 999n,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("creates a taxable percentage charge with a valid taxRateId", async () => {
    vi.mocked(extraChargeRepository.findTaxRateForTenant).mockResolvedValue({ id: 5n } as never);
    vi.mocked(extraChargeRepository.create).mockResolvedValue(
      chargeRow({ calcType: "PERCENTAGE", isTaxable: true, taxRateId: 5n }) as never,
    );

    const charge = await extraChargeService.create({
      tenantId: 1n,
      name: "Packing",
      calcType: "PERCENTAGE",
      value: "2",
      isTaxable: true,
      taxRateId: 5n,
    });

    expect(charge).toMatchObject({ isTaxable: true, taxRateId: "5" });
  });
});

describe("extraChargeService.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects flipping isTaxable to true without ever supplying a taxRateId", async () => {
    vi.mocked(extraChargeRepository.findByIdForTenant).mockResolvedValue(chargeRow() as never);

    await expect(
      extraChargeService.update({ tenantId: 1n, extraChargeId: 1n, isTaxable: true }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("allows flipping isActive without touching tax fields", async () => {
    vi.mocked(extraChargeRepository.findByIdForTenant).mockResolvedValue(chargeRow() as never);
    vi.mocked(extraChargeRepository.update).mockResolvedValue(chargeRow({ isActive: false }) as never);

    const charge = await extraChargeService.update({ tenantId: 1n, extraChargeId: 1n, isActive: false });

    expect(charge.isActive).toBe(false);
    expect(extraChargeRepository.findTaxRateForTenant).not.toHaveBeenCalled();
  });
});

describe("extraChargeService.remove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("soft-deletes without checking historical usage", async () => {
    vi.mocked(extraChargeRepository.findByIdForTenant).mockResolvedValue(chargeRow() as never);

    await extraChargeService.remove(1n, 1n, 42n);

    expect(extraChargeRepository.softDelete).toHaveBeenCalledWith(1n, 42n);
  });

  it("throws RESOURCE_NOT_FOUND for a charge outside the tenant", async () => {
    vi.mocked(extraChargeRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(extraChargeService.remove(1n, 999n)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
});
