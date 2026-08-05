import type { NextRequest } from "next/server";
import { createSupplierSchema, updateSupplierSchema } from "../schema/supplier.schema";
import { supplierService } from "../service/supplier.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type SupplierParams = { id: string };

export const supplierController = {
  async list(_request: NextRequest, auth: AuthContext) {
    try {
      const suppliers = await supplierService.list(auth.tenantId);
      return successResponse(suppliers, "Suppliers retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: SupplierParams) {
    try {
      const id = idString.parse(params.id);
      const supplier = await supplierService.getById(auth.tenantId, BigInt(id));
      return successResponse(supplier, "Supplier retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createSupplierSchema.parse(body);
      const supplier = await supplierService.create({
        tenantId: auth.tenantId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        state: input.state,
      });
      return successResponse(supplier, "Supplier created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async update(request: NextRequest, auth: AuthContext, params: SupplierParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = updateSupplierSchema.parse(body);
      const supplier = await supplierService.update({
        tenantId: auth.tenantId,
        supplierId: BigInt(id),
        name: input.name,
        email: input.email,
        phone: input.phone,
        state: input.state,
      });
      return successResponse(supplier, "Supplier updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async remove(_request: NextRequest, auth: AuthContext, params: SupplierParams) {
    try {
      const id = idString.parse(params.id);
      await supplierService.remove(auth.tenantId, BigInt(id));
      return successResponse(null, "Supplier deleted");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
