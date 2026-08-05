import type { NextRequest } from "next/server";
import { createRoleSchema, updateRoleSchema } from "../schema/role.schema";
import { roleService } from "../service/role.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type RoleParams = { id: string };

// Receive request -> parse -> call service -> return response. No Prisma,
// no business rules here (see MODULES.md -> controller/).
export const roleController = {
  async list(_request: NextRequest, auth: AuthContext) {
    try {
      const roles = await roleService.list(auth.tenantId);
      return successResponse(roles, "Roles retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: RoleParams) {
    try {
      const id = idString.parse(params.id);
      const role = await roleService.getById(auth.tenantId, BigInt(id));
      return successResponse(role, "Role retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createRoleSchema.parse(body);
      const role = await roleService.create({
        tenantId: auth.tenantId,
        name: input.name,
        code: input.code,
        permissionCodes: input.permissionCodes,
      });
      return successResponse(role, "Role created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async update(request: NextRequest, auth: AuthContext, params: RoleParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = updateRoleSchema.parse(body);
      const role = await roleService.update({
        tenantId: auth.tenantId,
        roleId: BigInt(id),
        name: input.name,
        code: input.code,
        permissionCodes: input.permissionCodes,
      });
      return successResponse(role, "Role updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async remove(_request: NextRequest, auth: AuthContext, params: RoleParams) {
    try {
      const id = idString.parse(params.id);
      await roleService.remove(auth.tenantId, BigInt(id));
      return successResponse(null, "Role deleted");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  // Backs GET /api/v1/permissions — the fixed platform catalog a role's
  // permission checklist is built from (see modules/role/service/role.service.ts).
  // Neither param is used (no per-tenant filtering — see role.repository.ts's
  // listPermissionCatalog), so both are omitted rather than name-and-ignore'd.
  async listPermissions() {
    try {
      const permissions = await roleService.listPermissionCatalog();
      return successResponse(permissions, "Permission catalog retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
