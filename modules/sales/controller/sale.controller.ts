import type { NextRequest } from "next/server";
import { createSaleSchema, listSalesQuerySchema } from "../schema/sale.schema";
import { saleService } from "../service/sale.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
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
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(sales, "Sales retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: SaleParams) {
    try {
      const id = idString.parse(params.id);
      const sale = await saleService.getById(auth.tenantId, BigInt(id), auth.warehouseId);
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
        customerId: BigInt(input.customerId),
        warehouseId: BigInt(input.warehouseId),
        channel: input.channel,
        saleDate: input.saleDate,
        items: input.items.map((item) => ({
          productId: BigInt(item.productId),
          quantity: item.quantity,
          price: item.price,
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

  async ship(_request: NextRequest, auth: AuthContext, params: SaleParams) {
    try {
      const id = idString.parse(params.id);
      const sale = await saleService.ship(auth.tenantId, BigInt(id), auth.warehouseId);
      return successResponse(sale, "Sale shipped");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async deliver(_request: NextRequest, auth: AuthContext, params: SaleParams) {
    try {
      const id = idString.parse(params.id);
      const sale = await saleService.deliver(auth.tenantId, BigInt(id), auth.warehouseId);
      return successResponse(sale, "Sale delivered");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
