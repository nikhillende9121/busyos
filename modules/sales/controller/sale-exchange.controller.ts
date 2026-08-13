import type { NextRequest } from "next/server";
import { createSaleExchangeSchema } from "../schema/sale-exchange.schema";
import { saleExchangeService } from "../service/sale-exchange.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type SaleExchangeParams = { id: string };

export const saleExchangeController = {
  async list(_request: NextRequest, auth: AuthContext) {
    try {
      const exchanges = await saleExchangeService.list(auth.tenantId, auth.warehouseId);
      return successResponse(exchanges, "Sale exchanges retrieved");
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
        paymentMethod: input.paymentMethod,
        createdBy: auth.userId,
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(exchange, "Sale exchange recorded", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
