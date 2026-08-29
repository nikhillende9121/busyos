import type { NextRequest } from "next/server";
import {
  balanceQuerySchema,
  exportBalanceQuerySchema,
  createStockAdjustmentSchema,
} from "../schema/inventory.schema";
import { inventoryService } from "../service/inventory.service";
import { successResponse, csvResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { toCsv } from "@/shared/utils/csv";
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
        search: query.search,
        page: query.page,
        pageSize: query.pageSize,
        scopedWarehouseId: auth.warehouseId,
      });
      return successResponse(balances, "Inventory balance retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  // Every row matching the same filters as listBalances(), as a CSV file —
  // see Docs/API_STANDARDS.md -> List Export.
  async exportBalances(request: NextRequest, auth: AuthContext) {
    try {
      const query = exportBalanceQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const balances = await inventoryService.exportBalances({
        tenantId: auth.tenantId,
        warehouseId: query.warehouseId ? BigInt(query.warehouseId) : undefined,
        productId: query.productId ? BigInt(query.productId) : undefined,
        search: query.search,
        scopedWarehouseId: auth.warehouseId,
      });
      const rows = balances.map((b) => ({
        productId: b.productId,
        productName: b.product?.name ?? "",
        productSku: b.product?.sku ?? "",
        warehouseId: b.warehouseId,
        quantity: b.quantity,
        price: b.price ?? "",
        updatedAt: b.updatedAt,
      }));
      const csv = toCsv(rows, [
        { key: "productId", header: "Product #" },
        { key: "productSku", header: "SKU" },
        { key: "productName", header: "Product Name" },
        { key: "warehouseId", header: "Warehouse #" },
        { key: "quantity", header: "Quantity" },
        { key: "price", header: "Price" },
        { key: "updatedAt", header: "Updated" },
      ]);
      return csvResponse(csv, `inventory-balance-${new Date().toISOString().slice(0, 10)}.csv`);
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
