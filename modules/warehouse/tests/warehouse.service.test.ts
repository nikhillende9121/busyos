import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../repository/warehouse.repository", () => ({
  warehouseRepository: {
    findManyByTenant: vi.fn(),
    findByIdForTenant: vi.fn(),
    countActiveByTenant: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    hasTerminals: vi.fn(),
    hasStock: vi.fn(),
  },
}));

vi.mock("@/shared/utils/plan-limits", () => ({
  getActivePlanLimits: vi.fn().mockResolvedValue({ maxWarehouses: null, maxUsers: null }),
}));

import { warehouseRepository } from "../repository/warehouse.repository";
import { getActivePlanLimits } from "@/shared/utils/plan-limits";
import { warehouseService } from "../service/warehouse.service";

function warehouseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 10n,
    tenantId: 1n,
    name: "MG Road Store",
    code: "MGR",
    address: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("warehouseService.list / getById — warehouse scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the scoped warehouseId through to the repository filter", async () => {
    vi.mocked(warehouseRepository.findManyByTenant).mockResolvedValue([warehouseRow()] as never);

    await warehouseService.list(1n, 10n);

    expect(warehouseRepository.findManyByTenant).toHaveBeenCalledWith(1n, 10n);
  });

  it("allows an unrestricted caller (scopedWarehouseId null) to fetch any warehouse by id", async () => {
    vi.mocked(warehouseRepository.findByIdForTenant).mockResolvedValue(warehouseRow() as never);

    const warehouse = await warehouseService.getById(1n, 10n, null);

    expect(warehouse.id).toBe("10");
  });

  it("rejects a scoped caller fetching a different warehouse by id", async () => {
    await expect(warehouseService.getById(1n, 10n, 999n)).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
    expect(warehouseRepository.findByIdForTenant).not.toHaveBeenCalled();
  });
});

describe("warehouseService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActivePlanLimits).mockResolvedValue({ maxWarehouses: null, maxUsers: null });
  });

  it("blocks creation once the plan's warehouse limit is reached", async () => {
    vi.mocked(getActivePlanLimits).mockResolvedValue({ maxWarehouses: 2, maxUsers: null });
    vi.mocked(warehouseRepository.countActiveByTenant).mockResolvedValue(2);

    await expect(
      warehouseService.create({ tenantId: 1n, name: "MG Road Store", code: "MGR" }),
    ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
    expect(warehouseRepository.create).not.toHaveBeenCalled();
  });

  it("allows creation when under the plan's warehouse limit", async () => {
    vi.mocked(getActivePlanLimits).mockResolvedValue({ maxWarehouses: 2, maxUsers: null });
    vi.mocked(warehouseRepository.countActiveByTenant).mockResolvedValue(1);
    vi.mocked(warehouseRepository.create).mockResolvedValue(warehouseRow() as never);

    await warehouseService.create({ tenantId: 1n, name: "MG Road Store", code: "MGR" });

    expect(warehouseRepository.create).toHaveBeenCalled();
  });

  it("maps a duplicate warehouse code to DUPLICATE_CODE", async () => {
    vi.mocked(warehouseRepository.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["tenantId", "code"] },
      }),
    );

    await expect(
      warehouseService.create({ tenantId: 1n, name: "MG Road Store", code: "MGR" }),
    ).rejects.toMatchObject({ code: "DUPLICATE_CODE" });
  });

  it("creates a warehouse when the code is unique", async () => {
    vi.mocked(warehouseRepository.create).mockResolvedValue(warehouseRow() as never);

    const warehouse = await warehouseService.create({
      tenantId: 1n,
      name: "MG Road Store",
      code: "MGR",
    });

    expect(warehouse).toMatchObject({ id: "10", code: "MGR" });
  });
});

describe("warehouseService.remove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(warehouseRepository.findByIdForTenant).mockResolvedValue(warehouseRow() as never);
  });

  it("blocks deletion when the warehouse still has registered terminals", async () => {
    vi.mocked(warehouseRepository.hasTerminals).mockResolvedValue(true);
    vi.mocked(warehouseRepository.hasStock).mockResolvedValue(false);

    await expect(warehouseService.remove(1n, 10n)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(warehouseRepository.softDelete).not.toHaveBeenCalled();
  });

  it("blocks deletion when the warehouse still holds stock", async () => {
    vi.mocked(warehouseRepository.hasTerminals).mockResolvedValue(false);
    vi.mocked(warehouseRepository.hasStock).mockResolvedValue(true);

    await expect(warehouseService.remove(1n, 10n)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(warehouseRepository.softDelete).not.toHaveBeenCalled();
  });

  it("soft-deletes a warehouse with no terminals or stock", async () => {
    vi.mocked(warehouseRepository.hasTerminals).mockResolvedValue(false);
    vi.mocked(warehouseRepository.hasStock).mockResolvedValue(false);

    await warehouseService.remove(1n, 10n, 42n);

    expect(warehouseRepository.softDelete).toHaveBeenCalledWith(10n, 42n);
  });

  it("throws RESOURCE_NOT_FOUND instead of checking dependents for a warehouse outside the tenant", async () => {
    vi.mocked(warehouseRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(warehouseService.remove(1n, 999n)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
    expect(warehouseRepository.hasTerminals).not.toHaveBeenCalled();
  });
});
