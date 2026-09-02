import "dotenv/config";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../repository/user.repository", () => ({
  userRepository: {
    findManyByTenant: vi.fn(),
    findByIdForTenant: vi.fn(),
    findRoleForTenant: vi.fn(),
    findWarehouseForTenant: vi.fn(),
    countActiveByTenant: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
}));

vi.mock("@/modules/auth/utils/password.util", () => ({
  hashPassword: vi.fn(async () => "hashed-password"),
}));

vi.mock("@/shared/utils/plan-limits", () => ({
  getActivePlanLimits: vi.fn(),
}));

import { userRepository } from "../repository/user.repository";
import { hashPassword } from "@/modules/auth/utils/password.util";
import { getActivePlanLimits } from "@/shared/utils/plan-limits";
import { userService } from "../service/user.service";

function userRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 10n,
    tenantId: 1n,
    roleId: 2n,
    warehouseId: null,
    name: "Jane Cashier",
    email: "jane@demo.test",
    password: "hashed-password",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    role: { id: 2n, name: "Cashier" },
    warehouse: null,
    ...overrides,
  };
}

describe("userService.list / getById", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("maps users to their view, including the joined role name", async () => {
    vi.mocked(userRepository.findManyByTenant).mockResolvedValue([userRow()] as never);

    const result = await userService.list(1n);

    expect(result).toEqual([
      {
        id: "10",
        name: "Jane Cashier",
        email: "jane@demo.test",
        roleId: "2",
        roleName: "Cashier",
        warehouseId: null,
        warehouseName: null,
        status: "ACTIVE",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("includes the joined warehouse name when the user is scoped to one store", async () => {
    vi.mocked(userRepository.findManyByTenant).mockResolvedValue([
      userRow({ warehouseId: 5n, warehouse: { id: 5n, name: "MG Road Store" } }),
    ] as never);

    const [result] = await userService.list(1n);

    expect(result).toMatchObject({ warehouseId: "5", warehouseName: "MG Road Store" });
  });

  it("rejects a user outside the tenant", async () => {
    vi.mocked(userRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(userService.getById(1n, 999n)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
});

describe("userService.create", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getActivePlanLimits).mockResolvedValue({ maxWarehouses: null, maxUsers: null, maxRoles: null, maxWebhooks: null });
  });

  it("blocks creation once the plan's user limit is reached", async () => {
    vi.mocked(getActivePlanLimits).mockResolvedValue({ maxWarehouses: null, maxUsers: 3, maxRoles: null, maxWebhooks: null });
    vi.mocked(userRepository.countActiveByTenant).mockResolvedValue(3);

    await expect(
      userService.create({ tenantId: 1n, name: "X", email: "x@demo.test", password: "Password123!", roleId: 2n }),
    ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it("allows creation when under the plan's user limit", async () => {
    vi.mocked(getActivePlanLimits).mockResolvedValue({ maxWarehouses: null, maxUsers: 3, maxRoles: null, maxWebhooks: null });
    vi.mocked(userRepository.countActiveByTenant).mockResolvedValue(2);
    vi.mocked(userRepository.findRoleForTenant).mockResolvedValue({ id: 2n } as never);
    vi.mocked(userRepository.create).mockResolvedValue(userRow() as never);

    await userService.create({
      tenantId: 1n,
      name: "Jane Cashier",
      email: "jane@demo.test",
      password: "Password123!",
      roleId: 2n,
    });

    expect(userRepository.create).toHaveBeenCalled();
  });

  it("hashes the password and creates the user when roleId belongs to the tenant", async () => {
    vi.mocked(userRepository.findRoleForTenant).mockResolvedValue({ id: 2n } as never);
    vi.mocked(userRepository.create).mockResolvedValue(userRow() as never);

    const result = await userService.create({
      tenantId: 1n,
      name: "Jane Cashier",
      email: "jane@demo.test",
      password: "Password123!",
      roleId: 2n,
    });

    expect(hashPassword).toHaveBeenCalledWith("Password123!");
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ password: "hashed-password", email: "jane@demo.test" }),
    );
    expect(result.roleName).toBe("Cashier");
  });

  it("rejects a roleId that does not belong to this tenant", async () => {
    vi.mocked(userRepository.findRoleForTenant).mockResolvedValue(null);

    await expect(
      userService.create({ tenantId: 1n, name: "X", email: "x@demo.test", password: "Password123!", roleId: 999n }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it("maps a duplicate email to DUPLICATE_EMAIL", async () => {
    vi.mocked(userRepository.findRoleForTenant).mockResolvedValue({ id: 2n } as never);
    vi.mocked(userRepository.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Duplicate", { code: "P2002", clientVersion: "test" }),
    );

    await expect(
      userService.create({ tenantId: 1n, name: "X", email: "jane@demo.test", password: "Password123!", roleId: 2n }),
    ).rejects.toMatchObject({ code: "DUPLICATE_EMAIL" });
  });

  it("rejects a warehouseId that does not belong to this tenant", async () => {
    vi.mocked(userRepository.findRoleForTenant).mockResolvedValue({ id: 2n } as never);
    vi.mocked(userRepository.findWarehouseForTenant).mockResolvedValue(null);

    await expect(
      userService.create({
        tenantId: 1n,
        name: "X",
        email: "x@demo.test",
        password: "Password123!",
        roleId: 2n,
        warehouseId: 999n,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it("scopes the new user to a warehouse that does belong to this tenant", async () => {
    vi.mocked(userRepository.findRoleForTenant).mockResolvedValue({ id: 2n } as never);
    vi.mocked(userRepository.findWarehouseForTenant).mockResolvedValue({ id: 5n } as never);
    vi.mocked(userRepository.create).mockResolvedValue(
      userRow({ warehouseId: 5n, warehouse: { id: 5n, name: "MG Road Store" } }) as never,
    );

    const result = await userService.create({
      tenantId: 1n,
      name: "Jane Cashier",
      email: "jane@demo.test",
      password: "Password123!",
      roleId: 2n,
      warehouseId: 5n,
    });

    expect(userRepository.create).toHaveBeenCalledWith(expect.objectContaining({ warehouseId: 5n }));
    expect(result.warehouseName).toBe("MG Road Store");
  });
});

describe("userService.update", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(userRepository.findByIdForTenant).mockResolvedValue(userRow() as never);
    vi.mocked(userRepository.update).mockResolvedValue(userRow({ status: "INACTIVE" }) as never);
  });

  it("updates fields without touching email/password", async () => {
    const result = await userService.update({ tenantId: 1n, userId: 10n, status: "INACTIVE" });

    expect(result.status).toBe("INACTIVE");
    expect(userRepository.update).toHaveBeenCalledWith(
      10n,
      expect.not.objectContaining({ email: expect.anything(), password: expect.anything() }),
    );
  });

  it("validates a new roleId belongs to the tenant", async () => {
    vi.mocked(userRepository.findRoleForTenant).mockResolvedValue(null);

    await expect(userService.update({ tenantId: 1n, userId: 10n, roleId: 999n })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects updating a user outside the tenant", async () => {
    vi.mocked(userRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(userService.update({ tenantId: 1n, userId: 999n, name: "X" })).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });

  it("validates a reassigned warehouseId belongs to the tenant", async () => {
    vi.mocked(userRepository.findWarehouseForTenant).mockResolvedValue(null);

    await expect(userService.update({ tenantId: 1n, userId: 10n, warehouseId: 999n })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("passes an explicit null warehouseId through to clear the restriction", async () => {
    await userService.update({ tenantId: 1n, userId: 10n, warehouseId: null });

    expect(userRepository.update).toHaveBeenCalledWith(10n, expect.objectContaining({ warehouseId: null }));
  });

  it("leaves warehouseId untouched when omitted from the update", async () => {
    await userService.update({ tenantId: 1n, userId: 10n, name: "Renamed" });

    expect(userRepository.update).toHaveBeenCalledWith(10n, expect.objectContaining({ warehouseId: undefined }));
  });
});

describe("userService.remove", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("soft-deletes an existing user", async () => {
    vi.mocked(userRepository.findByIdForTenant).mockResolvedValue(userRow() as never);

    await userService.remove(1n, 10n, 1n);

    expect(userRepository.softDelete).toHaveBeenCalledWith(10n, 1n);
  });

  it("rejects removing a user outside the tenant", async () => {
    vi.mocked(userRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(userService.remove(1n, 999n)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
});
