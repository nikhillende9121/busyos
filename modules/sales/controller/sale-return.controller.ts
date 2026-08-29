import type { NextRequest } from "next/server";
import {
  createSaleReturnSchema,
  quoteSaleReturnSchema,
  listSaleReturnsQuerySchema,
  exportSaleReturnsQuerySchema,
} from "../schema/sale-return.schema";
import { saleReturnService } from "../service/sale-return.service";
import { successResponse, csvResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { toCsv } from "@/shared/utils/csv";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type SaleReturnParams = { id: string };

export const saleReturnController = {
  async list(request: NextRequest, auth: AuthContext) {
    try {
      const query = listSaleReturnsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const returns = await saleReturnService.list({
        tenantId: auth.tenantId,
        saleId: query.saleId ? BigInt(query.saleId) : undefined,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        page: query.page,
        pageSize: query.pageSize,
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(returns, "Sale returns retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  // Every row matching the same filters as list(), as a CSV file — see
  // Docs/API_STANDARDS.md -> List Export.
  async exportList(request: NextRequest, auth: AuthContext) {
    try {
      const query = exportSaleReturnsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const returns = await saleReturnService.exportList({
        tenantId: auth.tenantId,
        saleId: query.saleId ? BigInt(query.saleId) : undefined,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        scopedWarehouseId: auth.warehouseId,
      });
      const rows = returns.map((r) => ({
        id: r.id,
        saleId: r.saleId,
        reason: r.reason,
        totalRefundAmount: r.totalRefundAmount,
        createdAt: r.createdAt,
      }));
      const csv = toCsv(rows, [
        { key: "id", header: "Return #" },
        { key: "saleId", header: "Sale #" },
        { key: "reason", header: "Reason" },
        { key: "totalRefundAmount", header: "Refund Amount" },
        { key: "createdAt", header: "Created" },
      ]);
      return csvResponse(csv, `sale-returns-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: SaleReturnParams) {
    try {
      const id = idString.parse(params.id);
      const saleReturn = await saleReturnService.getById(auth.tenantId, BigInt(id));
      return successResponse(saleReturn, "Sale return retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createSaleReturnSchema.parse(body);
      const saleReturn = await saleReturnService.create({
        tenantId: auth.tenantId,
        saleId: BigInt(input.saleId),
        reason: input.reason,
        items: input.items.map((item) => ({
          saleItemId: BigInt(item.saleItemId),
          quantity: item.quantity,
        })),
        createdBy: auth.userId,
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(saleReturn, "Sale return recorded", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  // Read-only preview — no record is created, no inventory or coupon
  // side-effects. See INVOICE_CALCULATION_LOGIC.md.
  async quote(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = quoteSaleReturnSchema.parse(body);
      const result = await saleReturnService.quote({
        tenantId: auth.tenantId,
        saleId: BigInt(input.saleId),
        items: input.items.map((item) => ({
          saleItemId: BigInt(item.saleItemId),
          quantity: item.quantity,
        })),
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(result, "Sale return quote computed");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
