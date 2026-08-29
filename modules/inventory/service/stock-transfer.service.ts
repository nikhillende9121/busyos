import { Prisma } from "@prisma/client";
import type { StockTransfer, StockTransferItem, StockTransferStatus, Warehouse, Product } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import { stockTransferRepository } from "../repository/stock-transfer.repository";
import { inventoryService } from "./inventory.service";
import { notificationService } from "@/modules/notification/service/notification.service";
import { AppError } from "@/shared/errors/app-error";
import { assertWarehouseAccess, assertWarehouseAccessAny } from "@/shared/utils/assert-warehouse-access";
import { buildPagination, type Paginated } from "@/shared/utils/pagination";
import type {
  CreateStockTransferDto,
  ApproveStockTransferDto,
  ShipStockTransferDto,
  ReceiveStockTransferDto,
  StockTransferListDto,
  StockTransferExportDto,
} from "../dto/stock-transfer.dto";
import type { StockTransferView } from "../types/stock-transfer.types";

const CANCELLABLE_STATUSES = new Set<StockTransferStatus>(["DRAFT", "APPROVED", "IN_TRANSIT"]);

// A scoped user may move stock in or out of their own store — either side
// matching is sufficient once fromWarehouseId exists (see
// shared/utils/assert-warehouse-access.ts). Requiring both would make
// transfers impossible for them. fromWarehouseId is null until approve(),
// so it's filtered out rather than passed through as null.
function warehouseIdsFor(transfer: { fromWarehouseId: bigint | null; toWarehouseId: bigint }): bigint[] {
  return [transfer.fromWarehouseId, transfer.toWarehouseId].filter((id): id is bigint => id !== null);
}

// Shared by approve/ship/receive: every existing line must get a quantity
// for this stage (no partial-coverage requests), and each requested
// quantity is capped by the previous stage's quantity on that same line
// (approved <= requested, shipped <= approved, received <= shipped) —
// confirmed with the user as the intended rule, not a made-up guess.
function resolveStageQuantities(
  items: StockTransferItem[],
  requests: { stockTransferItemId: bigint; quantity: string }[],
  capSelector: (item: StockTransferItem) => Prisma.Decimal | null,
  capLabel: string,
): Map<string, Prisma.Decimal> {
  const itemsById = new Map(items.map((item) => [item.id.toString(), item]));
  const requestIds = new Set(requests.map((request) => request.stockTransferItemId.toString()));
  if (requestIds.size !== items.length || items.some((item) => !requestIds.has(item.id.toString()))) {
    throw new AppError("VALIDATION_ERROR", "Every line item on this transfer must be included");
  }

  const quantities = new Map<string, Prisma.Decimal>();
  for (const request of requests) {
    const item = itemsById.get(request.stockTransferItemId.toString());
    if (!item) {
      throw new AppError(
        "VALIDATION_ERROR",
        `stockTransferItemId ${request.stockTransferItemId.toString()} does not belong to this transfer`,
      );
    }
    const quantity = new Prisma.Decimal(request.quantity);
    const cap = capSelector(item);
    // null means the previous stage never recorded a quantity for this item
    // at all — treat that as zero available, not "no limit". Reachable only
    // via inconsistent data (the normal approve/ship path always sets every
    // item's quantity — see the requestIds check above), but if it happens,
    // this must still reject rather than let receive/ship through unbounded.
    if (cap === null) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Cannot set ${capLabel} for product ${item.productId.toString()} — no quantity was recorded at the previous stage`,
      );
    }
    if (quantity.greaterThan(cap)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Cannot set ${capLabel} to ${quantity.toString()} for product ${item.productId.toString()} — only ${cap.toString()} is available from the previous stage`,
      );
    }
    quantities.set(item.id.toString(), quantity);
  }
  return quantities;
}

export const stockTransferService = {
  async list(filter: StockTransferListDto): Promise<Paginated<StockTransferView>> {
    const repoFilter = {
      warehouseId: filter.scopedWarehouseId ?? null,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
    };
    const skip = (filter.page - 1) * filter.pageSize;
    const [transfers, total] = await Promise.all([
      stockTransferRepository.findManyByTenant(filter.tenantId, { ...repoFilter, skip, take: filter.pageSize }),
      stockTransferRepository.countByTenant(filter.tenantId, repoFilter),
    ]);
    return {
      items: transfers.map(toStockTransferView),
      pagination: buildPagination(filter.page, filter.pageSize, total),
    };
  },

  // Same filter as list(), but every matching row — no page/pageSize — for
  // GET /stock-transfers/export.
  async exportList(filter: StockTransferExportDto): Promise<StockTransferView[]> {
    const transfers = await stockTransferRepository.findManyByTenant(filter.tenantId, {
      warehouseId: filter.scopedWarehouseId ?? null,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
    });
    return transfers.map(toStockTransferView);
  },

  async getById(
    tenantId: bigint,
    transferId: bigint,
    scopedWarehouseId: bigint | null = null,
  ): Promise<StockTransferView> {
    const transfer = await stockTransferRepository.findByIdForTenant(tenantId, transferId);
    if (!transfer) {
      throw new AppError("RESOURCE_NOT_FOUND", "Stock transfer not found");
    }
    assertWarehouseAccessAny({ warehouseId: scopedWarehouseId }, warehouseIdsFor(transfer));
    return toStockTransferView(transfer);
  },

  // Only the destination is known at request time — the source warehouse
  // isn't chosen until approve(). A scoped user requests stock arriving at
  // their own store, so this checks toWarehouseId alone (there's no
  // "other side" yet).
  async create(dto: CreateStockTransferDto): Promise<StockTransferView> {
    assertWarehouseAccess({ warehouseId: dto.scopedWarehouseId ?? null }, dto.toWarehouseId);

    const toWarehouse = await stockTransferRepository.findWarehouseForTenant(dto.tenantId, dto.toWarehouseId);
    if (!toWarehouse) {
      throw new AppError("VALIDATION_ERROR", "toWarehouseId does not belong to this tenant");
    }
    for (const item of dto.items) {
      const product = await stockTransferRepository.findProductForTenant(dto.tenantId, item.productId);
      if (!product) {
        throw new AppError(
          "VALIDATION_ERROR",
          `productId ${item.productId.toString()} does not belong to this tenant`,
        );
      }
    }

    const transfer = await prisma.$transaction(async (tx) => {
      const created = await stockTransferRepository.create(tx, {
        tenantId: dto.tenantId,
        toWarehouseId: dto.toWarehouseId,
        status: "DRAFT",
        transferDate: dto.transferDate,
        createdBy: dto.createdBy,
      });

      const items: StockTransferItem[] = [];
      for (const item of dto.items) {
        const createdItem = await stockTransferRepository.createItem(tx, {
          transferId: created.id,
          productId: item.productId,
          requestedQuantity: new Prisma.Decimal(item.requestedQuantity),
        });
        items.push(createdItem);
      }

      return { ...created, items };
    });

    // Fire push notification to destination warehouse staff asynchronously
    Promise.resolve(
      notificationService.sendToWarehouse({
        tenantId: dto.tenantId,
        warehouseId: dto.toWarehouseId,
        title: "New Stock Transfer Requested",
        message: `A new stock transfer #${transfer.id.toString()} has been requested for ${toWarehouse.name}.`,
        type: "STOCK_TRANSFER",
        data: { entityId: transfer.id.toString(), route: "STOCK_TRANSFER_DETAIL" },
      })
    ).catch((err) => console.error("Failed to send stock transfer create notification:", err));

    return toStockTransferView(transfer);
  },

  // Picks the source warehouse and how much of each requested line can
  // actually be spared — may be less than what was requested. No
  // inventory movement yet (still deferred to ship, same principle as
  // purchase/sales: stock moves only at a definite transition).
  async approve(dto: ApproveStockTransferDto): Promise<StockTransferView> {
    const transfer = await stockTransferRepository.findByIdForTenant(dto.tenantId, dto.transferId);
    if (!transfer) {
      throw new AppError("RESOURCE_NOT_FOUND", "Stock transfer not found");
    }
    if (transfer.status !== "DRAFT") {
      throw new AppError("VALIDATION_ERROR", `Only a DRAFT transfer can be approved, not ${transfer.status}`);
    }
    if (dto.fromWarehouseId === transfer.toWarehouseId) {
      throw new AppError("VALIDATION_ERROR", "fromWarehouseId and toWarehouseId must be different");
    }
    assertWarehouseAccessAny({ warehouseId: dto.scopedWarehouseId ?? null }, [
      dto.fromWarehouseId,
      transfer.toWarehouseId,
    ]);
    const fromWarehouse = await stockTransferRepository.findWarehouseForTenant(dto.tenantId, dto.fromWarehouseId);
    if (!fromWarehouse) {
      throw new AppError("VALIDATION_ERROR", "fromWarehouseId does not belong to this tenant");
    }

    const approvedQuantities = resolveStageQuantities(
      transfer.items,
      dto.items.map((item) => ({ stockTransferItemId: item.stockTransferItemId, quantity: item.approvedQuantity })),
      (item) => item.requestedQuantity,
      "approvedQuantity",
    );

    const updated = await prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        await stockTransferRepository.updateItemStage(tx, item.id, {
          approvedQuantity: approvedQuantities.get(item.id.toString()),
        });
      }
      const newTransfer = await stockTransferRepository.updateStatus(tx, transfer.id, "APPROVED", {
        fromWarehouseId: dto.fromWarehouseId,
      });
      const items = transfer.items.map((item) => ({
        ...item,
        approvedQuantity: approvedQuantities.get(item.id.toString())!,
      }));
      return { ...newTransfer, items };
    });

    // Notify both origin and destination warehouse staff that stock transfer was approved
    Promise.all([
      notificationService.sendToWarehouse({
        tenantId: dto.tenantId,
        warehouseId: dto.fromWarehouseId,
        title: "Stock Transfer Approved",
        message: `Stock transfer #${updated.id.toString()} has been approved for fulfillment from your warehouse.`,
        type: "STOCK_TRANSFER",
        data: { entityId: updated.id.toString(), route: "STOCK_TRANSFER_DETAIL" },
      }),
      notificationService.sendToWarehouse({
        tenantId: dto.tenantId,
        warehouseId: transfer.toWarehouseId,
        title: "Stock Transfer Approved",
        message: `Stock transfer #${updated.id.toString()} targeting your warehouse has been approved.`,
        type: "STOCK_TRANSFER",
        data: { entityId: updated.id.toString(), route: "STOCK_TRANSFER_DETAIL" },
      }),
    ]).catch((err) => console.error("Failed to send stock transfer approve notifications:", err));

    return toStockTransferView(updated);
  },

  // Stock leaves the source here, not at create/approve — same
  // "moves only at a definite transition" principle as purchase/sales.
  // IN_TRANSIT models the real gap between dispatch and arrival: goods are
  // logically gone from the source but not yet credited to the
  // destination, exactly like a truck actually being on the road between
  // two warehouses.
  async ship(dto: ShipStockTransferDto): Promise<StockTransferView> {
    const transfer = await stockTransferRepository.findByIdForTenant(dto.tenantId, dto.transferId);
    if (!transfer) {
      throw new AppError("RESOURCE_NOT_FOUND", "Stock transfer not found");
    }
    assertWarehouseAccessAny({ warehouseId: dto.scopedWarehouseId ?? null }, warehouseIdsFor(transfer));
    if (transfer.status !== "APPROVED") {
      throw new AppError("VALIDATION_ERROR", `Only an APPROVED transfer can be shipped, not ${transfer.status}`);
    }

    const shippedQuantities = resolveStageQuantities(
      transfer.items,
      dto.items.map((item) => ({ stockTransferItemId: item.stockTransferItemId, quantity: item.shippedQuantity })),
      (item) => item.approvedQuantity,
      "shippedQuantity",
    );
    // Guaranteed non-null: status APPROVED is only reachable via approve(),
    // which always sets fromWarehouseId.
    const fromWarehouseId = transfer.fromWarehouseId!;

    const updated = await prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        const shippedQuantity = shippedQuantities.get(item.id.toString())!;
        await inventoryService.recordMovement(
          {
            tenantId: dto.tenantId,
            warehouseId: fromWarehouseId,
            productId: item.productId,
            transactionType: "TRANSFER_OUT",
            quantityDelta: `-${shippedQuantity.toString()}`,
            referenceType: "STOCK_TRANSFER",
            referenceId: transfer.id,
          },
          tx,
        );
        await stockTransferRepository.updateItemStage(tx, item.id, { shippedQuantity });
      }
      const newTransfer = await stockTransferRepository.updateStatus(tx, transfer.id, "IN_TRANSIT");
      const items = transfer.items.map((item) => ({
        ...item,
        shippedQuantity: shippedQuantities.get(item.id.toString())!,
      }));
      return { ...newTransfer, items };
    });

    // Notify receiving warehouse staff that items are in transit
    Promise.resolve(
      notificationService.sendToWarehouse({
        tenantId: dto.tenantId,
        warehouseId: transfer.toWarehouseId,
        title: "Stock Transfer Shipped",
        message: `Stock transfer #${transfer.id.toString()} has been shipped and is in transit.`,
        type: "STOCK_TRANSFER",
        data: { entityId: transfer.id.toString(), route: "STOCK_TRANSFER_DETAIL" },
      })
    ).catch((err) => console.error("Failed to send stock transfer ship notification:", err));

    return toStockTransferView(updated);
  },

  async receive(dto: ReceiveStockTransferDto): Promise<StockTransferView> {
    const transfer = await stockTransferRepository.findByIdForTenant(dto.tenantId, dto.transferId);
    if (!transfer) {
      throw new AppError("RESOURCE_NOT_FOUND", "Stock transfer not found");
    }
    assertWarehouseAccessAny({ warehouseId: dto.scopedWarehouseId ?? null }, warehouseIdsFor(transfer));
    if (transfer.status !== "IN_TRANSIT") {
      throw new AppError(
        "VALIDATION_ERROR",
        `Only an IN_TRANSIT transfer can be received, not ${transfer.status}`,
      );
    }

    const receivedQuantities = resolveStageQuantities(
      transfer.items,
      dto.items.map((item) => ({ stockTransferItemId: item.stockTransferItemId, quantity: item.receivedQuantity })),
      (item) => item.shippedQuantity,
      "receivedQuantity",
    );

    const updated = await prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        const receivedQuantity = receivedQuantities.get(item.id.toString())!;
        await inventoryService.recordMovement(
          {
            tenantId: dto.tenantId,
            warehouseId: transfer.toWarehouseId,
            productId: item.productId,
            transactionType: "TRANSFER_IN",
            quantityDelta: receivedQuantity.toString(),
            referenceType: "STOCK_TRANSFER",
            referenceId: transfer.id,
          },
          tx,
        );
        await stockTransferRepository.updateItemStage(tx, item.id, { receivedQuantity });
      }
      const newTransfer = await stockTransferRepository.updateStatus(tx, transfer.id, "COMPLETED");
      const items = transfer.items.map((item) => ({
        ...item,
        receivedQuantity: receivedQuantities.get(item.id.toString())!,
      }));
      return { ...newTransfer, items };
    });

    // Notify origin warehouse staff that stock transfer was received
    if (transfer.fromWarehouseId) {
      Promise.resolve(
        notificationService.sendToWarehouse({
          tenantId: dto.tenantId,
          warehouseId: transfer.fromWarehouseId,
          title: "Stock Transfer Received",
          message: `Stock transfer #${transfer.id.toString()} was completed and received.`,
          type: "STOCK_TRANSFER",
          data: { entityId: transfer.id.toString(), route: "STOCK_TRANSFER_DETAIL" },
        })
      ).catch((err) => console.error("Failed to send stock transfer receive notification:", err));
    }

    return toStockTransferView(updated);
  },

  // Cancelling an IN_TRANSIT transfer must credit the source back — never a
  // silent balance edit, same rule as sale cancellation reversing a
  // CONFIRMED sale's SALE_OUT — using shippedQuantity (what actually left),
  // not requestedQuantity. DRAFT/APPROVED never moved anything, so
  // cancelling either is just a status change.
  async cancel(
    tenantId: bigint,
    transferId: bigint,
    scopedWarehouseId: bigint | null = null,
  ): Promise<StockTransferView> {
    const transfer = await stockTransferRepository.findByIdForTenant(tenantId, transferId);
    if (!transfer) {
      throw new AppError("RESOURCE_NOT_FOUND", "Stock transfer not found");
    }
    assertWarehouseAccessAny({ warehouseId: scopedWarehouseId }, warehouseIdsFor(transfer));
    if (!CANCELLABLE_STATUSES.has(transfer.status)) {
      throw new AppError("VALIDATION_ERROR", `Cannot cancel a transfer in status ${transfer.status}`);
    }

    if (transfer.status !== "IN_TRANSIT") {
      const updated = await stockTransferRepository.updateStatus(prisma, transferId, "CANCELLED");
      return toStockTransferView({ ...updated, items: transfer.items });
    }

    const fromWarehouseId = transfer.fromWarehouseId!;
    const updated = await prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        await inventoryService.recordMovement(
          {
            tenantId,
            warehouseId: fromWarehouseId,
            productId: item.productId,
            transactionType: "TRANSFER_IN",
            quantityDelta: item.shippedQuantity!.toString(),
            referenceType: "STOCK_TRANSFER",
            referenceId: transfer.id,
          },
          tx,
        );
      }
      const newTransfer = await stockTransferRepository.updateStatus(tx, transfer.id, "CANCELLED");
      return { ...newTransfer, items: transfer.items };
    });

    return toStockTransferView(updated);
  },
};

function toStockTransferView(
  transfer: StockTransfer & {
    fromWarehouse?: Warehouse | null;
    toWarehouse?: Warehouse | null;
    items: (StockTransferItem & { product?: Product | null })[];
  },
): StockTransferView {
  return {
    id: transfer.id.toString(),
    fromWarehouseId: transfer.fromWarehouseId?.toString() ?? null,
    fromWarehouse: transfer.fromWarehouse
      ? {
          id: transfer.fromWarehouse.id.toString(),
          name: transfer.fromWarehouse.name,
          code: transfer.fromWarehouse.code,
        }
      : transfer.fromWarehouse === null
      ? null
      : undefined,
    toWarehouseId: transfer.toWarehouseId.toString(),
    toWarehouse: transfer.toWarehouse
      ? {
          id: transfer.toWarehouse.id.toString(),
          name: transfer.toWarehouse.name,
          code: transfer.toWarehouse.code,
        }
      : transfer.toWarehouse === null
      ? null
      : undefined,
    status: transfer.status,
    transferDate: transfer.transferDate.toISOString(),
    items: transfer.items.map((item) => ({
      id: item.id.toString(),
      productId: item.productId.toString(),
      product: item.product
        ? {
            id: item.product.id.toString(),
            name: item.product.name,
            sku: item.product.sku,
            barcode: item.product.barcode ?? null,
          }
        : item.product === null
        ? null
        : undefined,
      requestedQuantity: item.requestedQuantity.toString(),
      approvedQuantity: item.approvedQuantity?.toString() ?? null,
      shippedQuantity: item.shippedQuantity?.toString() ?? null,
      receivedQuantity: item.receivedQuantity?.toString() ?? null,
    })),
    createdAt: transfer.createdAt.toISOString(),
    updatedAt: transfer.updatedAt.toISOString(),
  };
}
