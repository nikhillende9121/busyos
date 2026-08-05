import type { NextRequest } from "next/server";
import { createWarehouseSchema, updateWarehouseSchema } from "../schema/warehouse.schema";
import { warehouseService } from "../service/warehouse.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type WarehouseParams = { id: string };

// Receive request -> parse -> call service -> return response. No Prisma,
// no business rules here (see MODULES.md -> controller/).
export const warehouseController = {
  async list(_request: NextRequest, auth: AuthContext) {
    try {
      const warehouses = await warehouseService.list(auth.tenantId, auth.warehouseId);
      return successResponse(warehouses, "Warehouses retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: WarehouseParams) {
    try {
      const id = idString.parse(params.id);
      const warehouse = await warehouseService.getById(auth.tenantId, BigInt(id), auth.warehouseId);
      return successResponse(warehouse, "Warehouse retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createWarehouseSchema.parse(body);
      const warehouse = await warehouseService.create({
        tenantId: auth.tenantId,
        name: input.name,
        code: input.code,
        address: input.address,
        state: input.state,
        createdBy: auth.userId,
      });
      return successResponse(warehouse, "Warehouse created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async update(request: NextRequest, auth: AuthContext, params: WarehouseParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = updateWarehouseSchema.parse(body);
      const warehouse = await warehouseService.update({
        tenantId: auth.tenantId,
        warehouseId: BigInt(id),
        name: input.name,
        code: input.code,
        address: input.address,
        state: input.state,
        updatedBy: auth.userId,
      });
      return successResponse(warehouse, "Warehouse updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async remove(_request: NextRequest, auth: AuthContext, params: WarehouseParams) {
    try {
      const id = idString.parse(params.id);
      await warehouseService.remove(auth.tenantId, BigInt(id), auth.userId);
      return successResponse(null, "Warehouse deleted");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
