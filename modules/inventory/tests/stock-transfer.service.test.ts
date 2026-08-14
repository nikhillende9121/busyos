import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/shared/database/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback("transfer-tx")),
  },
}));

vi.mock("../repository/stock-transfer.repository", () => ({
  stockTransferRepository: {
    findManyByTenant: vi.fn(),
    findByIdForTenant: vi.fn(),
    create: vi.fn(),
    createItem: vi.fn(),
    updateStatus: vi.fn(),
    updateItemStage: vi.fn(),
    findWarehouseForTenant: vi.fn(),
    findProductForTenant: vi.fn(),
  },
}));

vi.mock("../service/inventory.service", () => ({
  inventoryService: {
    recordMovement: vi.fn(),
  },
}));

import { stockTransferRepository } from "../repository/stock-transfer.repository";
import { inventoryService } from "../service/inventory.service";
import { stockTransferService } from "../service/stock-transfer.service";

function transferRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 400n,
    tenantId: 1n,
    fromWarehouseId: 10n,
    toWarehouseId: 20n,
    status: "DRAFT",
    transferDate: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdBy: null,
    items: [
      {
        id: 500n,
        transferId: 400n,
        productId: 100n,
        requestedQuantity: new Prisma.Decimal("15"),
        approvedQuantity: null,
        shippedQuantity: null,
        receivedQuantity: null,
      },
    ],
    ...overrides,
  };
}

describe("stockTransferService.create", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(stockTransferRepository.findWarehouseForTenant).mockResolvedValue({ id: 20n } as never);
    vi.mocked(stockTransferRepository.findProductForTenant).mockResolvedValue({ id: 100n } as never);
    vi.mocked(stockTransferRepository.create).mockResolvedValue(
      transferRow({ fromWarehouseId: null, status: "DRAFT" }) as never,
    );
    vi.mocked(stockTransferRepository.createItem).mockResolvedValue({
      ...transferRow().items[0],
      approvedQuantity: null,
      shippedQuantity: null,
      receivedQuantity: null,
    } as never);
  });

  it("allows a scoped caller to create a transfer requesting stock into their own store", async () => {
    await expect(
      stockTransferService.create({
        tenantId: 1n,
        toWarehouseId: 20n,
        transferDate: new Date(),
        items: [{ productId: 100n, requestedQuantity: "15" }],
        scopedWarehouseId: 20n,
      }),
    ).resolves.toMatchObject({ toWarehouseId: "20", fromWarehouseId: null });
  });

  it("rejects a transfer requesting stock into a warehouse the caller isn't scoped to", async () => {
    await expect(
      stockTransferService.create({
        tenantId: 1n,
        toWarehouseId: 20n,
        transferDate: new Date(),
        items: [{ productId: 100n, requestedQuantity: "15" }],
        scopedWarehouseId: 999n,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(stockTransferRepository.create).not.toHaveBeenCalled();
  });

  it("rejects a destination warehouse outside the tenant", async () => {
    vi.mocked(stockTransferRepository.findWarehouseForTenant).mockResolvedValueOnce(null);

    await expect(
      stockTransferService.create({
        tenantId: 1n,
        toWarehouseId: 999n,
        transferDate: new Date(),
        items: [{ productId: 100n, requestedQuantity: "15" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(stockTransferRepository.create).not.toHaveBeenCalled();
  });

  it("creates a DRAFT transfer with no fromWarehouseId and only requestedQuantity set", async () => {
    const transfer = await stockTransferService.create({
      tenantId: 1n,
      toWarehouseId: 20n,
      transferDate: new Date("2026-01-01T00:00:00.000Z"),
      items: [{ productId: 100n, requestedQuantity: "15" }],
    });

    expect(transfer.status).toBe("DRAFT");
    expect(transfer.fromWarehouseId).toBeNull();
    expect(transfer.items).toEqual([
      {
        id: "500",
        productId: "100",
        requestedQuantity: "15",
        approvedQuantity: null,
        shippedQuantity: null,
        receivedQuantity: null,
      },
    ]);
  });
});

describe("stockTransferService.approve", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(stockTransferRepository.findWarehouseForTenant).mockResolvedValue({ id: 10n } as never);
    vi.mocked(stockTransferRepository.updateItemStage).mockImplementation(
      (_tx, id, data) => Promise.resolve({ id, ...data }) as never,
    );
  });

  it("rejects approving a transfer that isn't DRAFT", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(
      transferRow({ status: "APPROVED" }) as never,
    );

    await expect(
      stockTransferService.approve({
        tenantId: 1n,
        transferId: 400n,
        fromWarehouseId: 10n,
        items: [{ stockTransferItemId: 500n, approvedQuantity: "10" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(stockTransferRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("rejects fromWarehouseId equal to toWarehouseId", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(
      transferRow({ status: "DRAFT", fromWarehouseId: null }) as never,
    );

    await expect(
      stockTransferService.approve({
        tenantId: 1n,
        transferId: 400n,
        fromWarehouseId: 20n,
        items: [{ stockTransferItemId: 500n, approvedQuantity: "10" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(stockTransferRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("rejects a scoped caller touching neither the from nor to warehouse", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(
      transferRow({ status: "DRAFT", fromWarehouseId: null }) as never,
    );

    await expect(
      stockTransferService.approve({
        tenantId: 1n,
        transferId: 400n,
        fromWarehouseId: 10n,
        items: [{ stockTransferItemId: 500n, approvedQuantity: "10" }],
        scopedWarehouseId: 999n,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(stockTransferRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("rejects approvedQuantity greater than requestedQuantity", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(
      transferRow({ status: "DRAFT", fromWarehouseId: null }) as never,
    );

    await expect(
      stockTransferService.approve({
        tenantId: 1n,
        transferId: 400n,
        fromWarehouseId: 10n,
        items: [{ stockTransferItemId: 500n, approvedQuantity: "20" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(stockTransferRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("sets fromWarehouseId and approvedQuantity, moving status to APPROVED with no inventory movement", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(
      transferRow({ status: "DRAFT", fromWarehouseId: null }) as never,
    );
    vi.mocked(stockTransferRepository.updateStatus).mockResolvedValue(
      transferRow({ status: "APPROVED", fromWarehouseId: 10n }) as never,
    );

    const transfer = await stockTransferService.approve({
      tenantId: 1n,
      transferId: 400n,
      fromWarehouseId: 10n,
      items: [{ stockTransferItemId: 500n, approvedQuantity: "10" }],
    });

    expect(transfer.status).toBe("APPROVED");
    expect(transfer.fromWarehouseId).toBe("10");
    expect(transfer.items[0].approvedQuantity).toBe("10");
    expect(stockTransferRepository.updateStatus).toHaveBeenCalledWith("transfer-tx", 400n, "APPROVED", {
      fromWarehouseId: 10n,
    });
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });
});

describe("stockTransferService.ship", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(stockTransferRepository.updateItemStage).mockImplementation(
      (_tx, id, data) => Promise.resolve({ id, ...data }) as never,
    );
  });

  it("rejects shipping a transfer that isn't APPROVED", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(
      transferRow({ status: "DRAFT" }) as never,
    );

    await expect(
      stockTransferService.ship({
        tenantId: 1n,
        transferId: 400n,
        items: [{ stockTransferItemId: 500n, shippedQuantity: "10" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });

  it("rejects a scoped caller touching neither warehouse", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(
      transferRow({
        status: "APPROVED",
        items: [{ ...transferRow().items[0], approvedQuantity: new Prisma.Decimal("10") }],
      }) as never,
    );

    await expect(
      stockTransferService.ship({
        tenantId: 1n,
        transferId: 400n,
        items: [{ stockTransferItemId: 500n, shippedQuantity: "10" }],
        scopedWarehouseId: 999n,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(stockTransferRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("rejects shippedQuantity greater than approvedQuantity", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(
      transferRow({
        status: "APPROVED",
        items: [{ ...transferRow().items[0], approvedQuantity: new Prisma.Decimal("10") }],
      }) as never,
    );

    await expect(
      stockTransferService.ship({
        tenantId: 1n,
        transferId: 400n,
        items: [{ stockTransferItemId: 500n, shippedQuantity: "15" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });

  it("records TRANSFER_OUT using shippedQuantity and moves APPROVED to IN_TRANSIT", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(
      transferRow({
        status: "APPROVED",
        items: [{ ...transferRow().items[0], approvedQuantity: new Prisma.Decimal("10") }],
      }) as never,
    );
    vi.mocked(stockTransferRepository.updateStatus).mockResolvedValue(
      transferRow({ status: "IN_TRANSIT" }) as never,
    );

    const transfer = await stockTransferService.ship({
      tenantId: 1n,
      transferId: 400n,
      items: [{ stockTransferItemId: 500n, shippedQuantity: "8" }],
    });

    expect(transfer.status).toBe("IN_TRANSIT");
    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: 10n,
        productId: 100n,
        transactionType: "TRANSFER_OUT",
        quantityDelta: "-8",
        referenceType: "STOCK_TRANSFER",
        referenceId: 400n,
      }),
      "transfer-tx",
    );
  });
});

describe("stockTransferService.receive", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(stockTransferRepository.updateItemStage).mockImplementation(
      (_tx, id, data) => Promise.resolve({ id, ...data }) as never,
    );
  });

  it("rejects receiving a transfer that isn't IN_TRANSIT", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(
      transferRow({ status: "APPROVED" }) as never,
    );

    await expect(
      stockTransferService.receive({
        tenantId: 1n,
        transferId: 400n,
        items: [{ stockTransferItemId: 500n, receivedQuantity: "8" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });

  it("rejects receiving when shippedQuantity was never recorded (null treated as zero available, not unlimited)", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(
      transferRow({ status: "IN_TRANSIT" }) as never, // items[0].shippedQuantity is null by default
    );

    await expect(
      stockTransferService.receive({
        tenantId: 1n,
        transferId: 400n,
        items: [{ stockTransferItemId: 500n, receivedQuantity: "5" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });

  it("rejects receivedQuantity greater than shippedQuantity", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(
      transferRow({
        status: "IN_TRANSIT",
        items: [{ ...transferRow().items[0], shippedQuantity: new Prisma.Decimal("8") }],
      }) as never,
    );

    await expect(
      stockTransferService.receive({
        tenantId: 1n,
        transferId: 400n,
        items: [{ stockTransferItemId: 500n, receivedQuantity: "10" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });

  it("records TRANSFER_IN using receivedQuantity (simulating transit loss) and moves IN_TRANSIT to COMPLETED", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(
      transferRow({
        status: "IN_TRANSIT",
        items: [{ ...transferRow().items[0], shippedQuantity: new Prisma.Decimal("8") }],
      }) as never,
    );
    vi.mocked(stockTransferRepository.updateStatus).mockResolvedValue(
      transferRow({ status: "COMPLETED" }) as never,
    );

    const transfer = await stockTransferService.receive({
      tenantId: 1n,
      transferId: 400n,
      items: [{ stockTransferItemId: 500n, receivedQuantity: "5" }],
    });

    expect(transfer.status).toBe("COMPLETED");
    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: 20n,
        productId: 100n,
        transactionType: "TRANSFER_IN",
        quantityDelta: "5",
        referenceType: "STOCK_TRANSFER",
        referenceId: 400n,
      }),
      "transfer-tx",
    );
  });
});

describe("stockTransferService.cancel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("cancels a DRAFT transfer with no inventory reversal", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(
      transferRow({ status: "DRAFT", fromWarehouseId: null }) as never,
    );
    vi.mocked(stockTransferRepository.updateStatus).mockResolvedValue(
      transferRow({ status: "CANCELLED" }) as never,
    );

    const transfer = await stockTransferService.cancel(1n, 400n);

    expect(transfer.status).toBe("CANCELLED");
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });

  it("cancels an APPROVED transfer with no inventory reversal", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(
      transferRow({ status: "APPROVED" }) as never,
    );
    vi.mocked(stockTransferRepository.updateStatus).mockResolvedValue(
      transferRow({ status: "CANCELLED" }) as never,
    );

    const transfer = await stockTransferService.cancel(1n, 400n);

    expect(transfer.status).toBe("CANCELLED");
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });

  it("credits the source warehouse back using shippedQuantity when cancelling an IN_TRANSIT transfer", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(
      transferRow({
        status: "IN_TRANSIT",
        items: [{ ...transferRow().items[0], shippedQuantity: new Prisma.Decimal("8") }],
      }) as never,
    );
    vi.mocked(stockTransferRepository.updateStatus).mockResolvedValue(
      transferRow({ status: "CANCELLED" }) as never,
    );

    const transfer = await stockTransferService.cancel(1n, 400n);

    expect(transfer.status).toBe("CANCELLED");
    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: 10n,
        transactionType: "TRANSFER_IN",
        quantityDelta: "8",
        referenceType: "STOCK_TRANSFER",
        referenceId: 400n,
      }),
      "transfer-tx",
    );
  });

  it("rejects cancelling a COMPLETED transfer", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(
      transferRow({ status: "COMPLETED" }) as never,
    );

    await expect(stockTransferService.cancel(1n, 400n)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });
});

describe("stockTransferService — list/getById warehouse scoping", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("filters list() to transfers touching the caller's scoped warehouse on either side", async () => {
    vi.mocked(stockTransferRepository.findManyByTenant).mockResolvedValue([]);

    await stockTransferService.list(1n, 10n);

    expect(stockTransferRepository.findManyByTenant).toHaveBeenCalledWith(1n, 10n);
  });

  it("rejects getById for a scoped caller touching neither warehouse", async () => {
    vi.mocked(stockTransferRepository.findByIdForTenant).mockResolvedValue(transferRow() as never);

    await expect(stockTransferService.getById(1n, 400n, 999n)).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });
});
