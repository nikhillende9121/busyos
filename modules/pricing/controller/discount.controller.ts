import type { NextRequest } from "next/server";
import { createDiscountSchema } from "../schema/discount.schema";
import { discountService } from "../service/discount.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type DiscountParams = { id: string };

export const discountController = {
  async list(_request: NextRequest, auth: AuthContext) {
    try {
      const discounts = await discountService.list(auth.tenantId);
      return successResponse(discounts, "Discounts retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: DiscountParams) {
    try {
      const id = idString.parse(params.id);
      const discount = await discountService.getById(auth.tenantId, BigInt(id));
      return successResponse(discount, "Discount retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createDiscountSchema.parse(body);
      const discount = await discountService.create({
        tenantId: auth.tenantId,
        name: input.name,
        type: input.type,
        value: input.value,
        scope: input.scope,
        warehouseId: input.warehouseId ? BigInt(input.warehouseId) : undefined,
        customerGroupId: input.customerGroupId ? BigInt(input.customerGroupId) : undefined,
        customerId: input.customerId ? BigInt(input.customerId) : undefined,
        productIds: input.productIds?.map((id) => BigInt(id)),
        categoryIds: input.categoryIds?.map((id) => BigInt(id)),
        minPurchaseAmount: input.minPurchaseAmount,
        maxDiscountAmount: input.maxDiscountAmount,
        startDate: input.startDate,
        endDate: input.endDate,
        stackable: input.stackable,
        priority: input.priority,
      });
      return successResponse(discount, "Discount created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
