import type { NextRequest } from "next/server";
import { createUserSchema, updateUserSchema } from "../schema/user.schema";
import { userService } from "../service/user.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type UserParams = { id: string };

// Receive request -> parse -> call service -> return response. No Prisma,
// no business rules here (see MODULES.md -> controller/).
export const userController = {
  async list(_request: NextRequest, auth: AuthContext) {
    try {
      const users = await userService.list(auth.tenantId);
      return successResponse(users, "Users retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: UserParams) {
    try {
      const id = idString.parse(params.id);
      const user = await userService.getById(auth.tenantId, BigInt(id));
      return successResponse(user, "User retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createUserSchema.parse(body);
      const user = await userService.create({
        tenantId: auth.tenantId,
        name: input.name,
        email: input.email,
        password: input.password,
        roleId: BigInt(input.roleId),
        warehouseId: input.warehouseId ? BigInt(input.warehouseId) : undefined,
        createdBy: auth.userId,
      });
      return successResponse(user, "User created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async update(request: NextRequest, auth: AuthContext, params: UserParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = updateUserSchema.parse(body);
      const user = await userService.update({
        tenantId: auth.tenantId,
        userId: BigInt(id),
        name: input.name,
        roleId: input.roleId ? BigInt(input.roleId) : undefined,
        status: input.status,
        // undefined (key omitted) = leave unchanged; null (explicitly sent)
        // = clear the restriction; string = reassign — see updateUserSchema.
        warehouseId: input.warehouseId === undefined ? undefined : input.warehouseId ? BigInt(input.warehouseId) : null,
        updatedBy: auth.userId,
      });
      return successResponse(user, "User updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async remove(_request: NextRequest, auth: AuthContext, params: UserParams) {
    try {
      const id = idString.parse(params.id);
      await userService.remove(auth.tenantId, BigInt(id), auth.userId);
      return successResponse(null, "User deleted");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
