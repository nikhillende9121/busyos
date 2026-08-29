import type { NextRequest } from "next/server";
import {
  createPurchaseReturnSchema,
  listPurchaseReturnsQuerySchema,
  exportPurchaseReturnsQuerySchema,
} from "../schema/purchase-return.schema";
import { purchaseReturnService } from "../service/purchase-return.service";
import { successResponse, csvResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { toCsv } from "@/shared/utils/csv";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type PurchaseReturnParams = { id: string };

export const purchaseReturnController = {
  async list(request: NextRequest, auth: AuthContext) {
    try {
      const query = listPurchaseReturnsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const returns = await purchaseReturnService.list({
        tenantId: auth.tenantId,
        purchaseId: query.purchaseId ? BigInt(query.purchaseId) : undefined,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        page: query.page,
        pageSize: query.pageSize,
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(returns, "Purchase returns retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  // Every row matching the same filters as list(), as a CSV file — see
  // Docs/API_STANDARDS.md -> List Export.
  async exportList(request: NextRequest, auth: AuthContext) {
    try {
      const query = exportPurchaseReturnsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const returns = await purchaseReturnService.exportList({
        tenantId: auth.tenantId,
        purchaseId: query.purchaseId ? BigInt(query.purchaseId) : undefined,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        scopedWarehouseId: auth.warehouseId,
      });
      const rows = returns.map((r) => ({
        id: r.id,
        purchaseId: r.purchaseId,
        reason: r.reason,
        itemCount: r.items.length,
        createdAt: r.createdAt,
      }));
      const csv = toCsv(rows, [
        { key: "id", header: "Return #" },
        { key: "purchaseId", header: "Purchase #" },
        { key: "reason", header: "Reason" },
        { key: "itemCount", header: "Items" },
        { key: "createdAt", header: "Created" },
      ]);
      return csvResponse(csv, `purchase-returns-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: PurchaseReturnParams) {
    try {
      const id = idString.parse(params.id);
      const purchaseReturn = await purchaseReturnService.getById(auth.tenantId, BigInt(id));
      return successResponse(purchaseReturn, "Purchase return retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createPurchaseReturnSchema.parse(body);
      const purchaseReturn = await purchaseReturnService.create({
        tenantId: auth.tenantId,
        purchaseId: BigInt(input.purchaseId),
        reason: input.reason,
        items: input.items.map((item) => ({
          purchaseItemId: BigInt(item.purchaseItemId),
          quantity: item.quantity,
        })),
        createdBy: auth.userId,
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(purchaseReturn, "Purchase return recorded", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
