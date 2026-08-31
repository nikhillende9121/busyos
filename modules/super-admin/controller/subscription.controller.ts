import type { NextRequest } from "next/server";
import { createContractSchema } from "../schema/subscription.schema";
import { superAdminSubscriptionService } from "../service/subscription.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { SuperAdminAuthContext } from "@/shared/middleware/with-super-admin-auth";

type TenantParams = { id: string };
type SubscriptionParams = { id: string; subscriptionId: string };

export const superAdminSubscriptionController = {
  async list(_request: NextRequest, _auth: SuperAdminAuthContext, params: TenantParams) {
    try {
      const tenantId = idString.parse(params.id);
      const contracts = await superAdminSubscriptionService.listForTenant(BigInt(tenantId));
      return successResponse(contracts, "Contracts retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, _auth: SuperAdminAuthContext, params: TenantParams) {
    try {
      const tenantId = idString.parse(params.id);
      const body = await request.json();
      const input = createContractSchema.parse(body);
      const contract = await superAdminSubscriptionService.create({
        tenantId: BigInt(tenantId),
        planId: BigInt(input.planId),
        startDate: input.startDate,
        endDate: input.endDate,
      });
      return successResponse(contract, "Contract created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async cancel(_request: NextRequest, _auth: SuperAdminAuthContext, params: SubscriptionParams) {
    try {
      const tenantId = idString.parse(params.id);
      const subscriptionId = idString.parse(params.subscriptionId);
      const contract = await superAdminSubscriptionService.cancel({
        tenantId: BigInt(tenantId),
        subscriptionId: BigInt(subscriptionId),
      });
      return successResponse(contract, "Contract cancelled");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
