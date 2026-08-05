import type { NextRequest } from "next/server";
import { createUnitSchema, updateUnitSchema } from "../schema/unit.schema";
import { unitService } from "../service/unit.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type UnitParams = { id: string };

export const unitController = {
  async list(_request: NextRequest, auth: AuthContext) {
    try {
      const units = await unitService.list(auth.tenantId);
      return successResponse(units, "Units retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: UnitParams) {
    try {
      const id = idString.parse(params.id);
      const unit = await unitService.getById(auth.tenantId, BigInt(id));
      return successResponse(unit, "Unit retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createUnitSchema.parse(body);
      const unit = await unitService.create({
        tenantId: auth.tenantId,
        name: input.name,
        symbol: input.symbol,
      });
      return successResponse(unit, "Unit created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async update(request: NextRequest, auth: AuthContext, params: UnitParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = updateUnitSchema.parse(body);
      const unit = await unitService.update({
        tenantId: auth.tenantId,
        unitId: BigInt(id),
        name: input.name,
        symbol: input.symbol,
      });
      return successResponse(unit, "Unit updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async remove(_request: NextRequest, auth: AuthContext, params: UnitParams) {
    try {
      const id = idString.parse(params.id);
      await unitService.remove(auth.tenantId, BigInt(id));
      return successResponse(null, "Unit deleted");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
