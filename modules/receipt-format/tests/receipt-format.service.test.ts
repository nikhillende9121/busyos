import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/database/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback("receipt-format-tx")),
  },
}));

vi.mock("../repository/receipt-format.repository", () => ({
  receiptFormatRepository: {
    findMany: vi.fn(),
    findById: vi.fn(),
    findDefault: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    clearDefaultExcept: vi.fn(),
    findAssignmentByTenant: vi.fn(),
    findAssignmentByWarehouse: vi.fn(),
    findAssignmentByTerminal: vi.fn(),
    upsertTenantAssignment: vi.fn(),
    upsertWarehouseAssignment: vi.fn(),
    upsertTerminalAssignment: vi.fn(),
    findTerminalById: vi.fn(),
    findTenantById: vi.fn(),
    findWarehouseById: vi.fn(),
  },
}));

import { receiptFormatRepository } from "../repository/receipt-format.repository";
import { receiptFormatService } from "../service/receipt-format.service";

function formatRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1n,
    name: "58mm Standard",
    paperWidth: 58,
    schema: { sections: [{ type: "text", content: "Hi" }] },
    version: 1,
    isDefault: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    assignments: [],
    ...overrides,
  };
}

describe("receiptFormatService.resolveForTerminal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("never looks up the Terminal table — a tenant/default assignment must resolve even for an unregistered posId", async () => {
    vi.mocked(receiptFormatRepository.findAssignmentByTerminal).mockResolvedValue(null);
    vi.mocked(receiptFormatRepository.findAssignmentByTenant).mockResolvedValue({
      receiptFormat: formatRow({ id: 3n, name: "Tenant format" }),
    } as never);

    const result = await receiptFormatService.resolveForTerminal(5n, 100n, null);

    expect(result.formatId).toBe("3");
    expect(receiptFormatRepository.findTerminalById).not.toHaveBeenCalled();
  });

  it("prefers a terminal-level assignment over warehouse, tenant, and default", async () => {
    vi.mocked(receiptFormatRepository.findAssignmentByTerminal).mockResolvedValue({
      receiptFormat: formatRow({ id: 1n, name: "Terminal format" }),
    } as never);
    vi.mocked(receiptFormatRepository.findAssignmentByWarehouse).mockResolvedValue({
      receiptFormat: formatRow({ id: 2n, name: "Warehouse format" }),
    } as never);
    vi.mocked(receiptFormatRepository.findAssignmentByTenant).mockResolvedValue({
      receiptFormat: formatRow({ id: 3n, name: "Tenant format" }),
    } as never);

    const result = await receiptFormatService.resolveForTerminal(5n, 100n, 20n);

    expect(result.formatId).toBe("1");
    expect(receiptFormatRepository.findAssignmentByWarehouse).not.toHaveBeenCalled();
    expect(receiptFormatRepository.findAssignmentByTenant).not.toHaveBeenCalled();
  });

  it("falls back to the caller's own warehouse assignment (from auth, not a Terminal lookup) when there's no terminal-level one", async () => {
    vi.mocked(receiptFormatRepository.findAssignmentByTerminal).mockResolvedValue(null);
    vi.mocked(receiptFormatRepository.findAssignmentByWarehouse).mockResolvedValue({
      receiptFormat: formatRow({ id: 2n, name: "Warehouse format" }),
    } as never);
    vi.mocked(receiptFormatRepository.findAssignmentByTenant).mockResolvedValue({
      receiptFormat: formatRow({ id: 3n, name: "Tenant format" }),
    } as never);

    const result = await receiptFormatService.resolveForTerminal(5n, 100n, 20n);

    expect(result.formatId).toBe("2");
    expect(receiptFormatRepository.findAssignmentByWarehouse).toHaveBeenCalledWith(20n);
    expect(receiptFormatRepository.findAssignmentByTenant).not.toHaveBeenCalled();
  });

  it("skips the warehouse-level check entirely when the caller has no warehouse scope", async () => {
    vi.mocked(receiptFormatRepository.findAssignmentByTerminal).mockResolvedValue(null);
    vi.mocked(receiptFormatRepository.findAssignmentByTenant).mockResolvedValue({
      receiptFormat: formatRow({ id: 3n, name: "Tenant format" }),
    } as never);

    const result = await receiptFormatService.resolveForTerminal(5n, 100n, null);

    expect(result.formatId).toBe("3");
    expect(receiptFormatRepository.findAssignmentByWarehouse).not.toHaveBeenCalled();
  });

  it("falls back to the tenant assignment when neither terminal nor warehouse has one", async () => {
    vi.mocked(receiptFormatRepository.findAssignmentByTerminal).mockResolvedValue(null);
    vi.mocked(receiptFormatRepository.findAssignmentByWarehouse).mockResolvedValue(null);
    vi.mocked(receiptFormatRepository.findAssignmentByTenant).mockResolvedValue({
      receiptFormat: formatRow({ id: 3n, name: "Tenant format" }),
    } as never);

    const result = await receiptFormatService.resolveForTerminal(5n, 100n, 20n);

    expect(result.formatId).toBe("3");
  });

  it("falls back to the global default when nothing at all is assigned", async () => {
    vi.mocked(receiptFormatRepository.findAssignmentByTerminal).mockResolvedValue(null);
    vi.mocked(receiptFormatRepository.findAssignmentByWarehouse).mockResolvedValue(null);
    vi.mocked(receiptFormatRepository.findAssignmentByTenant).mockResolvedValue(null);
    vi.mocked(receiptFormatRepository.findDefault).mockResolvedValue(formatRow({ id: 4n, isDefault: true }) as never);

    const result = await receiptFormatService.resolveForTerminal(5n, 100n, 20n);

    expect(result.formatId).toBe("4");
  });

  it("throws RESOURCE_NOT_FOUND when nothing is assigned and there's no default either", async () => {
    vi.mocked(receiptFormatRepository.findAssignmentByTerminal).mockResolvedValue(null);
    vi.mocked(receiptFormatRepository.findAssignmentByWarehouse).mockResolvedValue(null);
    vi.mocked(receiptFormatRepository.findAssignmentByTenant).mockResolvedValue(null);
    vi.mocked(receiptFormatRepository.findDefault).mockResolvedValue(null);

    await expect(receiptFormatService.resolveForTerminal(5n, 100n, 20n)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });
});

describe("receiptFormatService.update", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(receiptFormatRepository.findById).mockResolvedValue(formatRow() as never);
  });

  it("rejects updating a format that doesn't exist", async () => {
    vi.mocked(receiptFormatRepository.findById).mockResolvedValue(null);

    await expect(
      receiptFormatService.update({
        formatId: 999n,
        name: "X",
        paperWidth: 58,
        schema: { sections: [{ type: "text" }] },
        isDefault: false,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect(receiptFormatRepository.update).not.toHaveBeenCalled();
  });

  it("bumps the version on every edit so the app's cache-check picks it up", async () => {
    await receiptFormatService.update({
      formatId: 1n,
      name: "58mm Standard v2",
      paperWidth: 58,
      schema: { sections: [{ type: "text" }] },
      isDefault: false,
    });

    expect(receiptFormatRepository.update).toHaveBeenCalledWith(
      "receipt-format-tx",
      1n,
      expect.objectContaining({ version: { increment: 1 } }),
    );
  });

  it("clears every other default when this edit makes it the new default", async () => {
    await receiptFormatService.update({
      formatId: 1n,
      name: "58mm Standard",
      paperWidth: 58,
      schema: { sections: [{ type: "text" }] },
      isDefault: true,
    });

    expect(receiptFormatRepository.clearDefaultExcept).toHaveBeenCalledWith("receipt-format-tx", 1n);
  });

  it("leaves other defaults alone when this edit doesn't touch isDefault", async () => {
    await receiptFormatService.update({
      formatId: 1n,
      name: "58mm Standard",
      paperWidth: 58,
      schema: { sections: [{ type: "text" }] },
      isDefault: false,
    });

    expect(receiptFormatRepository.clearDefaultExcept).not.toHaveBeenCalled();
  });
});

describe("receiptFormatService.assign", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(receiptFormatRepository.findById).mockResolvedValue(formatRow() as never);
  });

  it("assigns to a terminal when a terminalId is given, without touching the other scopes", async () => {
    vi.mocked(receiptFormatRepository.findTerminalById).mockResolvedValue({ id: 5n } as never);

    await receiptFormatService.assign({ formatId: 1n, terminalId: 5n });

    expect(receiptFormatRepository.upsertTerminalAssignment).toHaveBeenCalledWith(1n, 5n);
    expect(receiptFormatRepository.upsertWarehouseAssignment).not.toHaveBeenCalled();
    expect(receiptFormatRepository.upsertTenantAssignment).not.toHaveBeenCalled();
  });

  it("rejects assigning to a terminal that doesn't exist", async () => {
    vi.mocked(receiptFormatRepository.findTerminalById).mockResolvedValue(null);

    await expect(receiptFormatService.assign({ formatId: 1n, terminalId: 999n })).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
    expect(receiptFormatRepository.upsertTerminalAssignment).not.toHaveBeenCalled();
  });

  it("rejects assigning a format that doesn't exist", async () => {
    vi.mocked(receiptFormatRepository.findById).mockResolvedValue(null);

    await expect(receiptFormatService.assign({ formatId: 999n, tenantId: 1n })).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });
});
