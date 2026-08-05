import type { NextRequest } from "next/server";
import { createCustomerSchema, updateCustomerSchema } from "../schema/customer.schema";
import { customerService } from "../service/customer.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type CustomerParams = { id: string };

export const customerController = {
  async list(_request: NextRequest, auth: AuthContext) {
    try {
      const customers = await customerService.list(auth.tenantId);
      return successResponse(customers, "Customers retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: CustomerParams) {
    try {
      const id = idString.parse(params.id);
      const customer = await customerService.getById(auth.tenantId, BigInt(id));
      return successResponse(customer, "Customer retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createCustomerSchema.parse(body);
      const customer = await customerService.create({
        tenantId: auth.tenantId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        customerGroupId: input.customerGroupId ? BigInt(input.customerGroupId) : undefined,
        state: input.state,
      });
      return successResponse(customer, "Customer created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async update(request: NextRequest, auth: AuthContext, params: CustomerParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = updateCustomerSchema.parse(body);
      const customer = await customerService.update({
        tenantId: auth.tenantId,
        customerId: BigInt(id),
        name: input.name,
        email: input.email,
        phone: input.phone,
        customerGroupId: input.customerGroupId ? BigInt(input.customerGroupId) : undefined,
        state: input.state,
      });
      return successResponse(customer, "Customer updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async remove(_request: NextRequest, auth: AuthContext, params: CustomerParams) {
    try {
      const id = idString.parse(params.id);
      await customerService.remove(auth.tenantId, BigInt(id));
      return successResponse(null, "Customer deleted");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
