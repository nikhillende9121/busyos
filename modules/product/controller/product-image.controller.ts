import type { NextRequest } from "next/server";
import { productImageService } from "../service/product-image.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { AppError } from "@/shared/errors/app-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type ProductParams = { id: string };
type ProductImageParams = { id: string; imageId: string };

export const productImageController = {
  async upload(request: NextRequest, auth: AuthContext, params: ProductParams) {
    try {
      const productId = idString.parse(params.id);
      const formData = await request.formData();
      const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
      if (files.length === 0) {
        throw new AppError("VALIDATION_ERROR", "No files were uploaded");
      }
      const images = await productImageService.upload({
        tenantId: auth.tenantId,
        productId: BigInt(productId),
        files,
      });
      return successResponse(images, "Images uploaded", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async remove(_request: NextRequest, auth: AuthContext, params: ProductImageParams) {
    try {
      const productId = idString.parse(params.id);
      const imageId = idString.parse(params.imageId);
      await productImageService.remove({
        tenantId: auth.tenantId,
        productId: BigInt(productId),
        imageId: BigInt(imageId),
      });
      return successResponse(null, "Image deleted");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async makePrimary(_request: NextRequest, auth: AuthContext, params: ProductImageParams) {
    try {
      const productId = idString.parse(params.id);
      const imageId = idString.parse(params.imageId);
      await productImageService.makePrimary({
        tenantId: auth.tenantId,
        productId: BigInt(productId),
        imageId: BigInt(imageId),
      });
      return successResponse(null, "Primary image updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
