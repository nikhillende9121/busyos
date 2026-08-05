import type { NextRequest } from "next/server";
import { createSaleReturnSchema } from "../schema/sale-return.schema";
import { saleReturnService } from "../service/sale-return.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type SaleReturnParams = { id: string };

export const saleReturnController = {
  async list(request: NextRequest, auth: AuthContext) {
    try {
      const saleIdParam = request.nextUrl.searchParams.get("saleId");
      const saleId = saleIdParam ? BigInt(idString.parse(saleIdParam)) : undefined;
      const returns = await saleReturnService.list(auth.tenantId, saleId, auth.warehouseId);
      return successResponse(returns, "Sale returns retrieved");
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
};
