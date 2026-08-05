import type { NextRequest } from "next/server";
import { superAdminLoginSchema, superAdminRefreshSchema } from "../schema/auth.schema";
import { superAdminAuthService } from "../service/auth.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";

// Login/refresh are the two Super Admin endpoints that run with no prior
// authentication, by definition — same reasoning as modules/auth's tenant
// login/refresh.
export const superAdminAuthController = {
  async login(request: NextRequest) {
    try {
      const body = await request.json();
      const input = superAdminLoginSchema.parse(body);
      const tokens = await superAdminAuthService.login(input);
      return successResponse(tokens, "Login successful");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async refresh(request: NextRequest) {
    try {
      const body = await request.json();
      const input = superAdminRefreshSchema.parse(body);
      const tokens = await superAdminAuthService.refresh(input);
      return successResponse(tokens, "Token refreshed");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
