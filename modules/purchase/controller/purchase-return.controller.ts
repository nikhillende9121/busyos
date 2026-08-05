import type { NextRequest } from "next/server";
import { createPurchaseReturnSchema } from "../schema/purchase-return.schema";
import { purchaseReturnService } from "../service/purchase-return.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type PurchaseReturnParams = { id: string };

export const purchaseReturnController = {
  async list(request: NextRequest, auth: AuthContext) {
    try {
      const purchaseIdParam = request.nextUrl.searchParams.get("purchaseId");
      const purchaseId = purchaseIdParam ? BigInt(idString.parse(purchaseIdParam)) : undefined;
      const returns = await purchaseReturnService.list(auth.tenantId, purchaseId, auth.warehouseId);
      return successResponse(returns, "Purchase returns retrieved");
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
