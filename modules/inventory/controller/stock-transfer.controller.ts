import type { NextRequest } from "next/server";
import {
  createStockTransferSchema,
  approveStockTransferSchema,
  shipStockTransferSchema,
  receiveStockTransferSchema,
} from "../schema/stock-transfer.schema";
import { stockTransferService } from "../service/stock-transfer.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type StockTransferParams = { id: string };

export const stockTransferController = {
  async list(_request: NextRequest, auth: AuthContext) {
    try {
      const transfers = await stockTransferService.list(auth.tenantId, auth.warehouseId);
      return successResponse(transfers, "Stock transfers retrieved");
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
      console.log(body);
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
