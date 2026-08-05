import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../repository/unit.repository", () => ({
  unitRepository: {
    findManyVisibleToTenant: vi.fn(),
    findVisibleToTenant: vi.fn(),
    findOwnedByTenant: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    hardDelete: vi.fn(),
    hasProducts: vi.fn(),
  },
}));

import { unitRepository } from "../repository/unit.repository";
import { unitService } from "../service/unit.service";

function unitRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 5n,
    tenantId: null,
    name: "Kilogram",
    symbol: "kg",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("unitService.list / getById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a system-catalog unit (tenantId null) as shared", async () => {
    vi.mocked(unitRepository.findManyVisibleToTenant).mockResolvedValue([unitRow()] as never);

    const units = await unitService.list(1n);

    expect(units[0]).toMatchObject({ isShared: true, name: "Kilogram" });
  });

  it("marks a tenant-owned unit as not shared", async () => {
    vi.mocked(unitRepository.findVisibleToTenant).mockResolvedValue(
      unitRow({ tenantId: 1n, name: "Crate" }) as never,
    );

    const unit = await unitService.getById(1n, 5n);

    expect(unit).toMatchObject({ isShared: false, name: "Crate" });
  });
});

describe("unitService.update / remove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects editing a shared system unit through the tenant-owned lookup", async () => {
    // findOwnedByTenant filters by tenantId directly, so a shared unit
    // (tenantId = null) never matches — this is the guard, not a mock quirk.
    vi.mocked(unitRepository.findOwnedByTenant).mockResolvedValue(null);

    await expect(
      unitService.update({ tenantId: 1n, unitId: 5n, name: "Renamed" }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });

    expect(unitRepository.update).not.toHaveBeenCalled();
  });

  it("blocks hard delete when the unit is still assigned to products", async () => {
    vi.mocked(unitRepository.findOwnedByTenant).mockResolvedValue(
      unitRow({ tenantId: 1n }) as never,
    );
    vi.mocked(unitRepository.hasProducts).mockResolvedValue(true);

    await expect(unitService.remove(1n, 5n)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(unitRepository.hardDelete).not.toHaveBeenCalled();
  });

  it("hard-deletes a tenant-owned unit with no products assigned", async () => {
    vi.mocked(unitRepository.findOwnedByTenant).mockResolvedValue(
      unitRow({ tenantId: 1n }) as never,
    );
    vi.mocked(unitRepository.hasProducts).mockResolvedValue(false);

    await unitService.remove(1n, 5n);

    expect(unitRepository.hardDelete).toHaveBeenCalledWith(5n);
  });
});
