import type { NextRequest } from "next/server";
import { quoteSchema } from "../schema/promotion.schema";
import { promotionService } from "../service/promotion.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

export const promotionController = {
  async quote(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = quoteSchema.parse(body);
      const result = await promotionService.quote({
        tenantId: auth.tenantId,
        warehouseId: BigInt(input.warehouseId),
        customerId: input.customerId ? BigInt(input.customerId) : undefined,
        customerGroupId: input.customerGroupId ? BigInt(input.customerGroupId) : undefined,
        couponCode: input.couponCode,
        extraChargeIds: input.extraChargeIds?.map((id) => BigInt(id)),
        channel: input.channel,
        taxInclusive: input.taxInclusive,
        lines: input.lines.map((line) => ({
          productId: BigInt(line.productId),
          categoryId: line.categoryId ? BigInt(line.categoryId) : undefined,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      });
      return successResponse(result, "Quote computed");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
