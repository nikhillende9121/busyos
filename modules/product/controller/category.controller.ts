import type { NextRequest } from "next/server";
import { createCategorySchema, updateCategorySchema } from "../schema/category.schema";
import { categoryService } from "../service/category.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { AppError } from "@/shared/errors/app-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type CategoryParams = { id: string };

export const categoryController = {
  async list(_request: NextRequest, auth: AuthContext) {
    try {
      const categories = await categoryService.list(auth.tenantId);
      return successResponse(categories, "Categories retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: CategoryParams) {
    try {
      const id = idString.parse(params.id);
      const category = await categoryService.getById(auth.tenantId, BigInt(id));
      return successResponse(category, "Category retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createCategorySchema.parse(body);
      const category = await categoryService.create({
        tenantId: auth.tenantId,
        name: input.name,
        parentId: input.parentId ? BigInt(input.parentId) : undefined,
      });
      return successResponse(category, "Category created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async update(request: NextRequest, auth: AuthContext, params: CategoryParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = updateCategorySchema.parse(body);
      const category = await categoryService.update({
        tenantId: auth.tenantId,
        categoryId: BigInt(id),
        name: input.name,
        parentId: input.parentId ? BigInt(input.parentId) : undefined,
      });
      return successResponse(category, "Category updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async remove(_request: NextRequest, auth: AuthContext, params: CategoryParams) {
    try {
      const id = idString.parse(params.id);
      await categoryService.remove(auth.tenantId, BigInt(id));
      return successResponse(null, "Category deleted");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async uploadImage(request: NextRequest, auth: AuthContext, params: CategoryParams) {
    try {
      const id = idString.parse(params.id);
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        throw new AppError("VALIDATION_ERROR", "No file was uploaded");
      }
      const category = await categoryService.uploadImage({ tenantId: auth.tenantId, categoryId: BigInt(id), file });
      return successResponse(category, "Image uploaded");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async removeImage(_request: NextRequest, auth: AuthContext, params: CategoryParams) {
    try {
      const id = idString.parse(params.id);
      const category = await categoryService.removeImage({ tenantId: auth.tenantId, categoryId: BigInt(id) });
      return successResponse(category, "Image removed");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
