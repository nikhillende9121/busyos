import type { NextRequest } from "next/server";
import {
  createPurchaseSchema,
  receivePurchaseSchema,
  listPurchasesQuerySchema,
  exportPurchasesQuerySchema,
} from "../schema/purchase.schema";
import { purchaseService } from "../service/purchase.service";
import { successResponse, csvResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { toCsv } from "@/shared/utils/csv";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";
import type { PurchaseView } from "../types/purchase.types";

type PurchaseParams = { id: string };

// Receive request -> parse -> call service -> return response. No Prisma,
// no business rules here (see MODULES.md -> controller/).
export const purchaseController = {
  async list(request: NextRequest, auth: AuthContext) {
    try {
      const query = listPurchasesQuerySchema.parse(
        Object.fromEntries(request.nextUrl.searchParams),
      );
      const purchases = await purchaseService.list({
        tenantId: auth.tenantId,
        status: query.status,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        page: query.page,
        pageSize: query.pageSize,
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(purchases, "Purchases retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  // Every row matching the same filters as list(), as a CSV file — see
  // Docs/API_STANDARDS.md -> List Export.
  async exportList(request: NextRequest, auth: AuthContext) {
    try {
      const query = exportPurchasesQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const purchases = await purchaseService.exportList({
        tenantId: auth.tenantId,
        status: query.status,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        scopedWarehouseId: auth.warehouseId,
      });
      const rows = purchases.map((purchase: PurchaseView) => {
        const subtotal = purchase.items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
        const tax =
          purchase.items.reduce((sum, item) => sum + Number(item.tax), 0) +
          purchase.charges.reduce((sum, charge) => sum + Number(charge.taxAmount), 0);
        const charges = purchase.charges.reduce((sum, charge) => sum + Number(charge.amount), 0);
        return {
          id: purchase.id,
          supplierId: purchase.supplierId,
          status: purchase.status,
          purchaseDate: purchase.purchaseDate,
          subtotal: subtotal.toFixed(2),
          tax: tax.toFixed(2),
          total: (subtotal + tax + charges).toFixed(2),
        };
      });
      const csv = toCsv(rows, [
        { key: "id", header: "Purchase #" },
        { key: "supplierId", header: "Supplier ID" },
        { key: "status", header: "Status" },
        { key: "purchaseDate", header: "Purchase Date" },
        { key: "subtotal", header: "Subtotal" },
        { key: "tax", header: "Tax" },
        { key: "total", header: "Total" },
      ]);
      return csvResponse(csv, `purchases-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: PurchaseParams) {
    try {
      const id = idString.parse(params.id);
      const purchase = await purchaseService.getById(auth.tenantId, BigInt(id), auth.warehouseId);
      return successResponse(purchase, "Purchase retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createPurchaseSchema.parse(body);
      const purchase = await purchaseService.create({
        tenantId: auth.tenantId,
        supplierId: BigInt(input.supplierId),
        warehouseId: BigInt(input.warehouseId),
        purchaseDate: input.purchaseDate,
        items: input.items.map((item) => ({
          productId: BigInt(item.productId),
          quantity: item.quantity,
          price: item.price,
        })),
        extraChargeIds: input.extraChargeIds?.map((id) => BigInt(id)),
        createdBy: auth.userId,
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(purchase, "Purchase created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async confirm(_request: NextRequest, auth: AuthContext, params: PurchaseParams) {
    try {
      const id = idString.parse(params.id);
      const purchase = await purchaseService.confirm(auth.tenantId, BigInt(id), auth.warehouseId);
      return successResponse(purchase, "Purchase confirmed");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async cancel(_request: NextRequest, auth: AuthContext, params: PurchaseParams) {
    try {
      const id = idString.parse(params.id);
      const purchase = await purchaseService.cancel(auth.tenantId, BigInt(id), auth.warehouseId);
      return successResponse(purchase, "Purchase cancelled");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async receive(request: NextRequest, auth: AuthContext, params: PurchaseParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = receivePurchaseSchema.parse(body);
      const purchase = await purchaseService.receive({
        tenantId: auth.tenantId,
        purchaseId: BigInt(id),
        items: input.items.map((item) => ({
          purchaseItemId: BigInt(item.purchaseItemId),
          receivedQuantity: item.receivedQuantity,
        })),
        receivedBy: auth.userId,
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(purchase, "Purchase received");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
