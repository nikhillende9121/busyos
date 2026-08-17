import type { NextRequest } from "next/server";
import { createExtraChargeSchema, updateExtraChargeSchema } from "../schema/extra-charge.schema";
import { extraChargeService } from "../service/extra-charge.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type ExtraChargeParams = { id: string };

// Receive request -> parse -> call service -> return response. No Prisma,
// no business rules here (see MODULES.md -> controller/).
export const extraChargeController = {
  async list(_request: NextRequest, auth: AuthContext) {
    try {
      const charges = await extraChargeService.list(auth.tenantId);
      return successResponse(charges, "Extra charges retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: ExtraChargeParams) {
    try {
      const id = idString.parse(params.id);
      const charge = await extraChargeService.getById(auth.tenantId, BigInt(id));
      return successResponse(charge, "Extra charge retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createExtraChargeSchema.parse(body);
      const charge = await extraChargeService.create({
        tenantId: auth.tenantId,
        name: input.name,
        calcType: input.calcType,
        value: input.value,
        isTaxable: input.isTaxable,
        taxRateId: input.taxRateId !== undefined ? BigInt(input.taxRateId) : undefined,
        applicableChannels: input.applicableChannels,
        createdBy: auth.userId,
      });
      return successResponse(charge, "Extra charge created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async update(request: NextRequest, auth: AuthContext, params: ExtraChargeParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = updateExtraChargeSchema.parse(body);
      const charge = await extraChargeService.update({
        tenantId: auth.tenantId,
        extraChargeId: BigInt(id),
        name: input.name,
        calcType: input.calcType,
        value: input.value,
        isTaxable: input.isTaxable,
        taxRateId: input.taxRateId !== undefined ? BigInt(input.taxRateId) : undefined,
        isActive: input.isActive,
        applicableChannels: input.applicableChannels,
        updatedBy: auth.userId,
      });
      return successResponse(charge, "Extra charge updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async remove(_request: NextRequest, auth: AuthContext, params: ExtraChargeParams) {
    try {
      const id = idString.parse(params.id);
      await extraChargeService.remove(auth.tenantId, BigInt(id), auth.userId);
      return successResponse(null, "Extra charge deleted");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
