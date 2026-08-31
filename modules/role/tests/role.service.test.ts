import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/shared/database/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback("role-tx")),
  },
}));

vi.mock("../repository/role.repository", () => ({
  roleRepository: {
    findManyByTenant: vi.fn(),
    findByIdForTenant: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    hasActiveUsers: vi.fn(),
    findPermissionsByCodes: vi.fn(),
    replacePermissions: vi.fn(),
    listPermissionCatalog: vi.fn(),
    countActiveByTenant: vi.fn(),
  },
}));

vi.mock("@/shared/utils/plan-limits", () => ({
  getActivePlanLimits: vi.fn(),
}));

import { roleRepository } from "../repository/role.repository";
import { getActivePlanLimits } from "@/shared/utils/plan-limits";
import { roleService } from "../service/role.service";

function permission(overrides: Partial<{ id: bigint; code: string; module: string; action: string }> = {}) {
  return { id: 1n, code: "SALE.VIEW", module: "SALE", action: "VIEW", createdAt: new Date(), ...overrides };
}

function roleRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1n,
    tenantId: 1n,
    name: "Cashier",
    code: "CASHIER",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    rolePermissions: [{ roleId: 1n, permissionId: 1n, createdAt: new Date(), permission: permission() }],
    ...overrides,
  };
}

describe("roleService.list / getById", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("maps roles to their permission code list", async () => {
    vi.mocked(roleRepository.findManyByTenant).mockResolvedValue([roleRow()] as never);

    const result = await roleService.list(1n);

    expect(result).toEqual([
      { id: "1", name: "Cashier", code: "CASHIER", permissions: ["SALE.VIEW"], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("rejects a role outside the tenant", async () => {
    vi.mocked(roleRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(roleService.getById(1n, 999n)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
});

describe("roleService.create", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(roleRepository.create).mockResolvedValue({ id: 1n } as never);
    vi.mocked(roleRepository.replacePermissions).mockResolvedValue(undefined);
    vi.mocked(roleRepository.findByIdForTenant).mockResolvedValue(roleRow() as never);
    vi.mocked(getActivePlanLimits).mockResolvedValue({ maxWarehouses: null, maxUsers: null, maxRoles: null });
  });

  it("blocks creation once the plan's role limit is reached", async () => {
    vi.mocked(getActivePlanLimits).mockResolvedValue({ maxWarehouses: null, maxUsers: null, maxRoles: 3 });
    vi.mocked(roleRepository.countActiveByTenant).mockResolvedValue(3);

    await expect(
      roleService.create({ tenantId: 1n, name: "Cashier", code: "CASHIER", permissionCodes: [] }),
    ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
    expect(roleRepository.create).not.toHaveBeenCalled();
  });

  it("allows creation when under the plan's role limit", async () => {
    vi.mocked(getActivePlanLimits).mockResolvedValue({ maxWarehouses: null, maxUsers: null, maxRoles: 3 });
    vi.mocked(roleRepository.countActiveByTenant).mockResolvedValue(2);
    vi.mocked(roleRepository.findPermissionsByCodes).mockResolvedValue([]);

    await roleService.create({ tenantId: 1n, name: "Cashier", code: "CASHIER", permissionCodes: [] });
    expect(roleRepository.create).toHaveBeenCalled();
  });

  it("validates every submitted permission code exists before creating", async () => {
    vi.mocked(roleRepository.findPermissionsByCodes).mockResolvedValue([permission()] as never);

    const result = await roleService.create({ tenantId: 1n, name: "Cashier", code: "CASHIER", permissionCodes: ["SALE.VIEW"] });

    expect(result.permissions).toEqual(["SALE.VIEW"]);
    expect(roleRepository.replacePermissions).toHaveBeenCalledWith("role-tx", 1n, [1n]);
  });

  it("rejects an unknown permission code without creating anything", async () => {
    vi.mocked(roleRepository.findPermissionsByCodes).mockResolvedValue([]);

    await expect(
      roleService.create({ tenantId: 1n, name: "Cashier", code: "CASHIER", permissionCodes: ["NOT.REAL"] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(roleRepository.create).not.toHaveBeenCalled();
  });

  it("maps a duplicate role code to DUPLICATE_CODE", async () => {
    vi.mocked(roleRepository.findPermissionsByCodes).mockResolvedValue([]);
    vi.mocked(roleRepository.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Duplicate", { code: "P2002", clientVersion: "test" }),
    );

    await expect(roleService.create({ tenantId: 1n, name: "Cashier", code: "CASHIER" })).rejects.toMatchObject({
      code: "DUPLICATE_CODE",
    });
  });
});

describe("roleService.update", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(roleRepository.findByIdForTenant).mockResolvedValue(roleRow() as never);
    vi.mocked(roleRepository.update).mockResolvedValue(roleRow() as never);
  });

  it("replaces the permission set only when permissionCodes is provided", async () => {
    vi.mocked(roleRepository.findPermissionsByCodes).mockResolvedValue([permission({ id: 2n, code: "SALE.CREATE" })] as never);

    await roleService.update({ tenantId: 1n, roleId: 1n, permissionCodes: ["SALE.CREATE"] });

    expect(roleRepository.replacePermissions).toHaveBeenCalledWith("role-tx", 1n, [2n]);
  });

  it("leaves permissions untouched when permissionCodes is omitted", async () => {
    await roleService.update({ tenantId: 1n, roleId: 1n, name: "Renamed" });

    expect(roleRepository.replacePermissions).not.toHaveBeenCalled();
  });

  it("rejects updating a role outside the tenant", async () => {
    vi.mocked(roleRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(roleService.update({ tenantId: 1n, roleId: 999n, name: "X" })).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });
});

describe("roleService.remove", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(roleRepository.findByIdForTenant).mockResolvedValue(roleRow() as never);
  });

  it("blocks deleting a role that still has active users", async () => {
    vi.mocked(roleRepository.hasActiveUsers).mockResolvedValue(true);

    await expect(roleService.remove(1n, 1n)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(roleRepository.softDelete).not.toHaveBeenCalled();
  });

  it("soft-deletes a role with no active users", async () => {
    vi.mocked(roleRepository.hasActiveUsers).mockResolvedValue(false);

    await roleService.remove(1n, 1n);

    expect(roleRepository.softDelete).toHaveBeenCalledWith(1n);
  });
});

describe("roleService.listPermissionCatalog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("maps the platform permission catalog", async () => {
    vi.mocked(roleRepository.listPermissionCatalog).mockResolvedValue([permission()] as never);

    const result = await roleService.listPermissionCatalog();

    expect(result).toEqual([{ code: "SALE.VIEW", module: "SALE", action: "VIEW" }]);
  });
});
