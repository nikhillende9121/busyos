import type { NextRequest } from "next/server";
import {
  createSaleExchangeSchema,
  quoteSaleExchangeSchema,
  listSaleExchangesQuerySchema,
  exportSaleExchangesQuerySchema,
} from "../schema/sale-exchange.schema";
import { saleExchangeService } from "../service/sale-exchange.service";
import { successResponse, csvResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { toCsv } from "@/shared/utils/csv";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type SaleExchangeParams = { id: string };

export const saleExchangeController = {
  async list(request: NextRequest, auth: AuthContext) {
    try {
      const query = listSaleExchangesQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const exchanges = await saleExchangeService.list({
        tenantId: auth.tenantId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        page: query.page,
        pageSize: query.pageSize,
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(exchanges, "Sale exchanges retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  // Every row matching the same filters as list(), as a CSV file — see
  // Docs/API_STANDARDS.md -> List Export.
  async exportList(request: NextRequest, auth: AuthContext) {
    try {
      const query = exportSaleExchangesQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const exchanges = await saleExchangeService.exportList({
        tenantId: auth.tenantId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        scopedWarehouseId: auth.warehouseId,
      });
      const rows = exchanges.map((e) => ({
        id: e.id,
        originalSaleId: e.saleReturn.saleId,
        newSaleNumber: e.newSale.saleNumber,
        differenceAmount: e.differenceAmount,
        differenceDirection: e.differenceDirection,
        createdAt: e.createdAt,
      }));
      const csv = toCsv(rows, [
        { key: "id", header: "Exchange #" },
        { key: "originalSaleId", header: "Original Sale #" },
        { key: "newSaleNumber", header: "New Sale #" },
        { key: "differenceAmount", header: "Difference Amount" },
        { key: "differenceDirection", header: "Direction" },
        { key: "createdAt", header: "Created" },
      ]);
      return csvResponse(csv, `sale-exchanges-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: SaleExchangeParams) {
    try {
      const id = idString.parse(params.id);
      const exchange = await saleExchangeService.getById(auth.tenantId, BigInt(id));
      return successResponse(exchange, "Sale exchange retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createSaleExchangeSchema.parse(body);
      const exchange = await saleExchangeService.create({
        tenantId: auth.tenantId,
        saleId: BigInt(input.saleId),
        reason: input.reason,
        returnItems: input.returnItems.map((item) => ({
          saleItemId: BigInt(item.saleItemId),
          quantity: item.quantity,
        })),
        newItems: input.newItems.map((item) => ({
          productId: BigInt(item.productId),
          quantity: item.quantity,
        })),
        couponCode: input.couponCode,
        extraChargeIds: input.extraChargeIds?.map((id) => BigInt(id)),
        taxInclusive: input.taxInclusive,
        paymentMethod: input.paymentMethod,
        createdBy: auth.userId,
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(exchange, "Sale exchange recorded", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  // Read-only preview — no return leg, no replacement sale, no Payment, no
  // coupon redemption. See INVOICE_CALCULATION_LOGIC.md.
  async quote(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = quoteSaleExchangeSchema.parse(body);
      const result = await saleExchangeService.quote({
        tenantId: auth.tenantId,
        saleId: BigInt(input.saleId),
        returnItems: input.returnItems.map((item) => ({
          saleItemId: BigInt(item.saleItemId),
          quantity: item.quantity,
        })),
        newItems: input.newItems.map((item) => ({
          productId: BigInt(item.productId),
          quantity: item.quantity,
        })),
        couponCode: input.couponCode,
        extraChargeIds: input.extraChargeIds?.map((id) => BigInt(id)),
        taxInclusive: input.taxInclusive,
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(result, "Sale exchange quote computed");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
