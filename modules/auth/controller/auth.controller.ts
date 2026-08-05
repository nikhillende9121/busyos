import type { NextRequest } from "next/server";
import { loginSchema, refreshSchema } from "../schema/auth.schema";
import { authService } from "../service/auth.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

// Receive request -> parse -> call service -> return response. No Prisma,
// no business rules, no permission/feature checks here (see MODULES.md ->
// controller/). Login/refresh are the two endpoints in the whole app that
// run with no prior authentication, by definition.
export const authController = {
  async login(request: NextRequest) {
    try {
      const body = await request.json();
      const input = loginSchema.parse(body);
      const tokens = await authService.login(input);
      return successResponse(tokens, "Login successful");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async refresh(request: NextRequest) {
    try {
      const body = await request.json();
      const input = refreshSchema.parse(body);
      const tokens = await authService.refresh(input);
      return successResponse(tokens, "Token refreshed");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async me(_request: NextRequest, auth: AuthContext) {
    try {
      const profile = await authService.me(auth);
      return successResponse(profile, "Current user retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
