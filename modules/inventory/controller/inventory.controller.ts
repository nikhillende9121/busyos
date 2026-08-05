import type { NextRequest } from "next/server";
import { balanceQuerySchema, createStockAdjustmentSchema } from "../schema/inventory.schema";
import { inventoryService } from "../service/inventory.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

// Receive request -> parse -> call service -> return response. No Prisma,
// no business rules here (see MODULES.md -> controller/).
export const inventoryController = {
  async listBalances(request: NextRequest, auth: AuthContext) {
    try {
      const query = balanceQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const balances = await inventoryService.listBalances({
        tenantId: auth.tenantId,
        warehouseId: query.warehouseId ? BigInt(query.warehouseId) : undefined,
        productId: query.productId ? BigInt(query.productId) : undefined,
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(balances, "Inventory balance retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async createStockAdjustment(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createStockAdjustmentSchema.parse(body);
      const adjustment = await inventoryService.createStockAdjustment({
        tenantId: auth.tenantId,
        warehouseId: BigInt(input.warehouseId),
        reason: input.reason,
        items: input.items.map((item) => ({
          productId: BigInt(item.productId),
          quantityDelta: item.quantityDelta,
        })),
        createdBy: auth.userId,
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(adjustment, "Stock adjustment recorded", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
