import type { NextRequest } from "next/server";
import { createTenantSchema, updateTenantStatusSchema } from "../schema/tenant.schema";
import { superAdminTenantService } from "../service/tenant.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { AppError } from "@/shared/errors/app-error";
import { idString } from "@/shared/validation/id";
import type { SuperAdminAuthContext } from "@/shared/middleware/with-super-admin-auth";

type TenantParams = { id: string };

export const superAdminTenantController = {
  async list() {
    try {
      const tenants = await superAdminTenantService.list();
      return successResponse(tenants, "Tenants retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, _auth: SuperAdminAuthContext, params: TenantParams) {
    try {
      const id = idString.parse(params.id);
      const tenant = await superAdminTenantService.getById(BigInt(id));
      return successResponse(tenant, "Tenant retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest) {
    try {
      const body = await request.json();
      const input = createTenantSchema.parse(body);
      const tenant = await superAdminTenantService.create({
        name: input.name,
        code: input.code,
        planId: BigInt(input.planId),
        adminName: input.adminName,
        adminEmail: input.adminEmail,
        adminPassword: input.adminPassword,
      });
      return successResponse(tenant, "Tenant created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async updateStatus(request: NextRequest, _auth: SuperAdminAuthContext, params: TenantParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = updateTenantStatusSchema.parse(body);
      const tenant = await superAdminTenantService.updateStatus({ tenantId: BigInt(id), status: input.status });
      return successResponse(tenant, "Tenant status updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async uploadLogo(request: NextRequest, _auth: SuperAdminAuthContext, params: TenantParams) {
    try {
      const id = idString.parse(params.id);
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        throw new AppError("VALIDATION_ERROR", "No file was uploaded");
      }
      const tenant = await superAdminTenantService.uploadLogo({ tenantId: BigInt(id), file });
      return successResponse(tenant, "Logo uploaded");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async removeLogo(_request: NextRequest, _auth: SuperAdminAuthContext, params: TenantParams) {
    try {
      const id = idString.parse(params.id);
      const tenant = await superAdminTenantService.removeLogo({ tenantId: BigInt(id) });
      return successResponse(tenant, "Logo removed");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
