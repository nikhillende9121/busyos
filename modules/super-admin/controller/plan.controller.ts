import type { NextRequest } from "next/server";
import { createPlanSchema, updatePlanSchema } from "../schema/plan.schema";
import { superAdminPlanService } from "../service/plan.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { SuperAdminAuthContext } from "@/shared/middleware/with-super-admin-auth";

type PlanParams = { id: string };

export const superAdminPlanController = {
  async list() {
    try {
      const plans = await superAdminPlanService.list();
      return successResponse(plans, "Plans retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest) {
    try {
      const body = await request.json();
      const input = createPlanSchema.parse(body);
      const plan = await superAdminPlanService.create(input);
      return successResponse(plan, "Plan created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async update(request: NextRequest, _auth: SuperAdminAuthContext, params: PlanParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = updatePlanSchema.parse(body);
      const plan = await superAdminPlanService.update({ planId: BigInt(id), ...input });
      return successResponse(plan, "Plan updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
