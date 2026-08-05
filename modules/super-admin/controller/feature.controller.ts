import type { NextRequest } from "next/server";
import { createFeatureSchema } from "../schema/feature.schema";
import { superAdminFeatureService } from "../service/feature.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";

export const superAdminFeatureController = {
  async list() {
    try {
      const features = await superAdminFeatureService.list();
      return successResponse(features, "Features retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest) {
    try {
      const body = await request.json();
      const input = createFeatureSchema.parse(body);
      const feature = await superAdminFeatureService.create(input);
      return successResponse(feature, "Feature created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
