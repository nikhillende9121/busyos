import type { NextRequest } from "next/server";
import { createSaleSchema, listSalesQuerySchema, exportSalesQuerySchema, shipSaleSchema } from "../schema/sale.schema";
import { saleService } from "../service/sale.service";
import { successResponse, csvResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { toCsv } from "@/shared/utils/csv";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type SaleParams = { id: string };

// Receive request -> parse -> call service -> return response. No Prisma,
// no business rules here (see MODULES.md -> controller/).
export const saleController = {
  async list(request: NextRequest, auth: AuthContext) {
    try {
      const query = listSalesQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const sales = await saleService.list({
        tenantId: auth.tenantId,
        status: query.status,
        channel: query.channel,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        page: query.page,
        pageSize: query.pageSize,
        scopedWarehouseId: auth.warehouseId,
        requestingUserId: auth.userId,
        requestingRoleId: auth.roleId,
      });
      return successResponse(sales, "Sales retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  // Every row matching the same filters as list(), as a CSV file — see
  // Docs/API_STANDARDS.md -> List Export.
  async exportList(request: NextRequest, auth: AuthContext) {
    try {
      const query = exportSalesQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const sales = await saleService.exportList({
        tenantId: auth.tenantId,
        status: query.status,
        channel: query.channel,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        scopedWarehouseId: auth.warehouseId,
        requestingUserId: auth.userId,
        requestingRoleId: auth.roleId,
      });
      const csv = toCsv(sales, [
        { key: "saleNumber", header: "Sale #" },
        { key: "customerName", header: "Customer" },
        { key: "channel", header: "Channel" },
        { key: "status", header: "Status" },
        { key: "saleDate", header: "Sale Date" },
        { key: "subtotal", header: "Subtotal" },
        { key: "taxAmount", header: "Tax" },
        { key: "totalAmount", header: "Total" },
      ]);
      return csvResponse(csv, `sales-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: SaleParams) {
    try {
      const id = idString.parse(params.id);
      const sale = await saleService.getById(auth.tenantId, BigInt(id), auth.warehouseId, auth.userId, auth.roleId);
      return successResponse(sale, "Sale retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createSaleSchema.parse(body);
      const sale = await saleService.create({
        tenantId: auth.tenantId,
        customerId: input.customerId ? BigInt(input.customerId) : undefined,
        warehouseId: BigInt(input.warehouseId),
        channel: input.channel,
        saleDate: input.saleDate,
        items: input.items.map((item) => ({
          productId: BigInt(item.productId),
          quantity: item.quantity,
        })),
        couponCode: input.couponCode,
        extraChargeIds: input.extraChargeIds?.map((id) => BigInt(id)),
        createdBy: auth.userId,
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(sale, "Sale created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async confirm(_request: NextRequest, auth: AuthContext, params: SaleParams) {
    try {
      const id = idString.parse(params.id);
      const sale = await saleService.confirm(auth.tenantId, BigInt(id), auth.warehouseId);
      return successResponse(sale, "Sale confirmed");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async complete(_request: NextRequest, auth: AuthContext, params: SaleParams) {
    try {
      const id = idString.parse(params.id);
      const sale = await saleService.complete(auth.tenantId, BigInt(id), auth.warehouseId);
      return successResponse(sale, "Sale completed");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async cancel(_request: NextRequest, auth: AuthContext, params: SaleParams) {
    try {
      const id = idString.parse(params.id);
      const sale = await saleService.cancel(auth.tenantId, BigInt(id), auth.warehouseId);
      return successResponse(sale, "Sale cancelled");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async process(_request: NextRequest, auth: AuthContext, params: SaleParams) {
    try {
      const id = idString.parse(params.id);
      const sale = await saleService.process(auth.tenantId, BigInt(id), auth.warehouseId);
      return successResponse(sale, "Sale moved to processing");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async pack(_request: NextRequest, auth: AuthContext, params: SaleParams) {
    try {
      const id = idString.parse(params.id);
      const sale = await saleService.pack(auth.tenantId, BigInt(id), auth.warehouseId);
      return successResponse(sale, "Sale packed");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async ship(request: NextRequest, auth: AuthContext, params: SaleParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = shipSaleSchema.parse(body);
      const sale = await saleService.ship(
        auth.tenantId,
        BigInt(id),
        auth.warehouseId,
        BigInt(input.assignedDeliveryUserId),
      );
      return successResponse(sale, "Sale shipped");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async deliver(_request: NextRequest, auth: AuthContext, params: SaleParams) {
    try {
      const id = idString.parse(params.id);
      const sale = await saleService.deliver(auth.tenantId, BigInt(id), auth.warehouseId, auth.userId, auth.roleId);
      return successResponse(sale, "Sale delivered");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async listDeliveryAssignees(_request: NextRequest, auth: AuthContext) {
    try {
      const assignees = await saleService.listDeliveryAssignees(auth.tenantId);
      return successResponse(assignees, "Eligible delivery assignees retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
