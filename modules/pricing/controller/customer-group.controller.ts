import type { NextRequest } from "next/server";
import { createCustomerGroupSchema, updateCustomerGroupSchema } from "../schema/customer-group.schema";
import { customerGroupService } from "../service/customer-group.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type CustomerGroupParams = { id: string };

export const customerGroupController = {
  async list(_request: NextRequest, auth: AuthContext) {
    try {
      const groups = await customerGroupService.list(auth.tenantId);
      return successResponse(groups, "Customer groups retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: CustomerGroupParams) {
    try {
      const id = idString.parse(params.id);
      const group = await customerGroupService.getById(auth.tenantId, BigInt(id));
      return successResponse(group, "Customer group retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createCustomerGroupSchema.parse(body);
      const group = await customerGroupService.create({
        tenantId: auth.tenantId,
        name: input.name,
        code: input.code,
      });
      return successResponse(group, "Customer group created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async update(request: NextRequest, auth: AuthContext, params: CustomerGroupParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = updateCustomerGroupSchema.parse(body);
      const group = await customerGroupService.update({
        tenantId: auth.tenantId,
        customerGroupId: BigInt(id),
        name: input.name,
        code: input.code,
      });
      return successResponse(group, "Customer group updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async remove(_request: NextRequest, auth: AuthContext, params: CustomerGroupParams) {
    try {
      const id = idString.parse(params.id);
      await customerGroupService.remove(auth.tenantId, BigInt(id));
      return successResponse(null, "Customer group deleted");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
