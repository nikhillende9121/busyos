import type { NextRequest } from "next/server";
import { updateTenantSettingsSchema } from "../schema/tenant.schema";
import { tenantService } from "../service/tenant.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

// Receive request -> parse -> call service -> return response. No Prisma,
// no business rules here (see MODULES.md -> controller/). `auth` is
// injected by shared/middleware/with-api-auth.ts, which has already run
// the full Authentication/Tenant/Subscription/Feature/Permission pipeline
// by the time either method below executes.
export const tenantController = {
  async getProfile(_request: NextRequest, auth: AuthContext) {
    try {
      const profile = await tenantService.getProfile(auth.tenantId);
      return successResponse(profile, "Tenant retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getSubscription(_request: NextRequest, auth: AuthContext) {
    try {
      const subscription = await tenantService.getSubscription(auth.tenantId);
      return successResponse(subscription, "Subscription retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async updateSettings(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = updateTenantSettingsSchema.parse(body);
      const profile = await tenantService.updateSettings({
        tenantId: auth.tenantId,
        ...input,
        defaultTaxRateId:
          input.defaultTaxRateId === undefined
            ? undefined
            : input.defaultTaxRateId
              ? BigInt(input.defaultTaxRateId)
              : null,
      });
      return successResponse(profile, "Tenant settings updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
