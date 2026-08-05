import type { NextRequest } from "next/server";
import { createBrandSchema, updateBrandSchema } from "../schema/brand.schema";
import { brandService } from "../service/brand.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { AppError } from "@/shared/errors/app-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type BrandParams = { id: string };

export const brandController = {
  async list(_request: NextRequest, auth: AuthContext) {
    try {
      const brands = await brandService.list(auth.tenantId);
      return successResponse(brands, "Brands retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: BrandParams) {
    try {
      const id = idString.parse(params.id);
      const brand = await brandService.getById(auth.tenantId, BigInt(id));
      return successResponse(brand, "Brand retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createBrandSchema.parse(body);
      const brand = await brandService.create({ tenantId: auth.tenantId, name: input.name });
      return successResponse(brand, "Brand created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async update(request: NextRequest, auth: AuthContext, params: BrandParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = updateBrandSchema.parse(body);
      const brand = await brandService.update({
        tenantId: auth.tenantId,
        brandId: BigInt(id),
        name: input.name,
      });
      return successResponse(brand, "Brand updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async remove(_request: NextRequest, auth: AuthContext, params: BrandParams) {
    try {
      const id = idString.parse(params.id);
      await brandService.remove(auth.tenantId, BigInt(id));
      return successResponse(null, "Brand deleted");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async uploadImage(request: NextRequest, auth: AuthContext, params: BrandParams) {
    try {
      const id = idString.parse(params.id);
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        throw new AppError("VALIDATION_ERROR", "No file was uploaded");
      }
      const brand = await brandService.uploadImage({ tenantId: auth.tenantId, brandId: BigInt(id), file });
      return successResponse(brand, "Image uploaded");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async removeImage(_request: NextRequest, auth: AuthContext, params: BrandParams) {
    try {
      const id = idString.parse(params.id);
      const brand = await brandService.removeImage({ tenantId: auth.tenantId, brandId: BigInt(id) });
      return successResponse(brand, "Image removed");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
