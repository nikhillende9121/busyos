import type { NextRequest } from "next/server";
import { listProductBatchesQuerySchema } from "../schema/product-batch.schema";
import { productBatchService } from "../service/product-batch.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

export const productBatchController = {
  async list(request: NextRequest, auth: AuthContext) {
    try {
      const query = listProductBatchesQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const result = await productBatchService.list({
        tenantId: auth.tenantId,
        warehouseId: query.warehouseId ? BigInt(query.warehouseId) : undefined,
        productId: query.productId ? BigInt(query.productId) : undefined,
        expiringWithinDays: query.expiringWithinDays,
        page: query.page,
        pageSize: query.pageSize,
      });
      return successResponse(result, "Product batches retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
