import type { NextRequest } from "next/server";
import {
  createStockTransferSchema,
  approveStockTransferSchema,
  shipStockTransferSchema,
  receiveStockTransferSchema,
  listStockTransfersQuerySchema,
  exportStockTransfersQuerySchema,
} from "../schema/stock-transfer.schema";
import { stockTransferService } from "../service/stock-transfer.service";
import { successResponse, csvResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { toCsv } from "@/shared/utils/csv";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type StockTransferParams = { id: string };

export const stockTransferController = {
  async list(request: NextRequest, auth: AuthContext) {
    try {
      const query = listStockTransfersQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const transfers = await stockTransferService.list({
        tenantId: auth.tenantId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        page: query.page,
        pageSize: query.pageSize,
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(transfers, "Stock transfers retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  // Every row matching the same filters as list(), as a CSV file — see
  // Docs/API_STANDARDS.md -> List Export.
  async exportList(request: NextRequest, auth: AuthContext) {
    try {
      const query = exportStockTransfersQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const transfers = await stockTransferService.exportList({
        tenantId: auth.tenantId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        scopedWarehouseId: auth.warehouseId,
      });
      const rows = transfers.map((t) => ({
        id: t.id,
        fromWarehouseId: t.fromWarehouseId ?? "",
        toWarehouseId: t.toWarehouseId,
        status: t.status,
        transferDate: t.transferDate,
      }));
      const csv = toCsv(rows, [
        { key: "id", header: "Transfer #" },
        { key: "fromWarehouseId", header: "From Warehouse ID" },
        { key: "toWarehouseId", header: "To Warehouse ID" },
        { key: "status", header: "Status" },
        { key: "transferDate", header: "Transfer Date" },
      ]);
      return csvResponse(csv, `stock-transfers-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: StockTransferParams) {
    try {
      const id = idString.parse(params.id);
      const transfer = await stockTransferService.getById(auth.tenantId, BigInt(id), auth.warehouseId);
      return successResponse(transfer, "Stock transfer retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  // Only toWarehouseId is known at request time — the source warehouse
  // isn't chosen until approve().
  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createStockTransferSchema.parse(body);
      const transfer = await stockTransferService.create({
        tenantId: auth.tenantId,
        toWarehouseId: BigInt(input.toWarehouseId),
        transferDate: input.transferDate,
        items: input.items.map((item) => ({
          productId: BigInt(item.productId),
          requestedQuantity: item.requestedQuantity,
        })),
        createdBy: auth.userId,
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(transfer, "Stock transfer created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async approve(request: NextRequest, auth: AuthContext, params: StockTransferParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = approveStockTransferSchema.parse(body);
      const transfer = await stockTransferService.approve({
        tenantId: auth.tenantId,
        transferId: BigInt(id),
        fromWarehouseId: BigInt(input.fromWarehouseId),
        items: input.items.map((item) => ({
          stockTransferItemId: BigInt(item.stockTransferItemId),
          approvedQuantity: item.approvedQuantity,
        })),
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(transfer, "Stock transfer approved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async ship(request: NextRequest, auth: AuthContext, params: StockTransferParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = shipStockTransferSchema.parse(body);
      const transfer = await stockTransferService.ship({
        tenantId: auth.tenantId,
        transferId: BigInt(id),
        items: input.items.map((item) => ({
          stockTransferItemId: BigInt(item.stockTransferItemId),
          shippedQuantity: item.shippedQuantity,
        })),
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(transfer, "Stock transfer shipped");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async receive(request: NextRequest, auth: AuthContext, params: StockTransferParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = receiveStockTransferSchema.parse(body);
      const transfer = await stockTransferService.receive({
        tenantId: auth.tenantId,
        transferId: BigInt(id),
        items: input.items.map((item) => ({
          stockTransferItemId: BigInt(item.stockTransferItemId),
          receivedQuantity: item.receivedQuantity,
        })),
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(transfer, "Stock transfer received");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async cancel(_request: NextRequest, auth: AuthContext, params: StockTransferParams) {
    try {
      const id = idString.parse(params.id);
      const transfer = await stockTransferService.cancel(auth.tenantId, BigInt(id), auth.warehouseId);
      return successResponse(transfer, "Stock transfer cancelled");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
