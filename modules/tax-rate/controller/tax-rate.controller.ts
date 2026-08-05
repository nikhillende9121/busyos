import type { NextRequest } from "next/server";
import { createTaxRateSchema, updateTaxRateSchema } from "../schema/tax-rate.schema";
import { taxRateService } from "../service/tax-rate.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type TaxRateParams = { id: string };

// Receive request -> parse -> call service -> return response. No Prisma,
// no business rules here (see MODULES.md -> controller/).
export const taxRateController = {
  async list(_request: NextRequest, auth: AuthContext) {
    try {
      const rates = await taxRateService.list(auth.tenantId);
      return successResponse(rates, "Tax rates retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: TaxRateParams) {
    try {
      const id = idString.parse(params.id);
      const rate = await taxRateService.getById(auth.tenantId, BigInt(id));
      return successResponse(rate, "Tax rate retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createTaxRateSchema.parse(body);
      const rate = await taxRateService.create({
        tenantId: auth.tenantId,
        name: input.name,
        hsnCode: input.hsnCode,
        sacCode: input.sacCode,
        ratePercent: input.ratePercent,
        cessPercent: input.cessPercent,
        createdBy: auth.userId,
      });
      return successResponse(rate, "Tax rate created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async update(request: NextRequest, auth: AuthContext, params: TaxRateParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = updateTaxRateSchema.parse(body);
      const rate = await taxRateService.update({
        tenantId: auth.tenantId,
        taxRateId: BigInt(id),
        name: input.name,
        hsnCode: input.hsnCode,
        sacCode: input.sacCode,
        ratePercent: input.ratePercent,
        cessPercent: input.cessPercent,
        isActive: input.isActive,
        updatedBy: auth.userId,
      });
      return successResponse(rate, "Tax rate updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async remove(_request: NextRequest, auth: AuthContext, params: TaxRateParams) {
    try {
      const id = idString.parse(params.id);
      await taxRateService.remove(auth.tenantId, BigInt(id), auth.userId);
      return successResponse(null, "Tax rate deleted");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
