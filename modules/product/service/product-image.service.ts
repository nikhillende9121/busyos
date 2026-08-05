import { prisma } from "@/shared/database/prisma";
import { productImageRepository } from "../repository/product-image.repository";
import { productRepository } from "../repository/product.repository";
import { AppError } from "@/shared/errors/app-error";
import { uploadImage, destroyImage } from "@/shared/utils/cloudinary";
import { assertValidImageFile } from "@/shared/utils/validate-image-file";
import { toProductImageView } from "./product-image-view.mapper";
import type {
  UploadProductImagesDto,
  RemoveProductImageDto,
  MakePrimaryProductImageDto,
} from "../dto/product-image.dto";
import type { ProductImageView } from "../types/product-image.types";

const MAX_IMAGES_PER_PRODUCT = 8;

async function assertProductBelongsToTenant(tenantId: bigint, productId: bigint): Promise<void> {
  const product = await productRepository.findByIdForTenant(tenantId, productId);
  if (!product) {
    throw new AppError("RESOURCE_NOT_FOUND", "Product not found");
  }
}

export const productImageService = {
  async upload(dto: UploadProductImagesDto): Promise<ProductImageView[]> {
    await assertProductBelongsToTenant(dto.tenantId, dto.productId);

    const existingCount = await productImageRepository.countByProduct(dto.productId);
    if (existingCount + dto.files.length > MAX_IMAGES_PER_PRODUCT) {
      throw new AppError(
        "VALIDATION_ERROR",
        `A product can have at most ${MAX_IMAGES_PER_PRODUCT} images (${existingCount} already uploaded)`,
      );
    }
    for (const file of dto.files) {
      assertValidImageFile(file);
    }

    let nextSortOrder = await productImageRepository.nextSortOrder(dto.productId);
    const created: ProductImageView[] = [];
    for (const file of dto.files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const publicId = await uploadImage(buffer, file.type, `tenants/${dto.tenantId}/products/${dto.productId}`);
      const image = await productImageRepository.create({
        productId: dto.productId,
        publicId,
        sortOrder: nextSortOrder++,
      });
      created.push(toProductImageView(image));
    }
    return created;
  },

  async remove(dto: RemoveProductImageDto): Promise<void> {
    await assertProductBelongsToTenant(dto.tenantId, dto.productId);
    const image = await productImageRepository.findByIdForProduct(dto.productId, dto.imageId);
    if (!image) {
      throw new AppError("RESOURCE_NOT_FOUND", "Image not found");
    }
    await destroyImage(image.publicId);
    await productImageRepository.remove(dto.imageId);
  },

  // Swaps sortOrder with the current primary (lowest sortOrder) instead of
  // rewriting the whole list's order — a no-op if the target is already
  // primary.
  async makePrimary(dto: MakePrimaryProductImageDto): Promise<void> {
    await assertProductBelongsToTenant(dto.tenantId, dto.productId);
    const images = await productImageRepository.findAllForProduct(dto.productId);
    const target = images.find((image) => image.id === dto.imageId);
    if (!target) {
      throw new AppError("RESOURCE_NOT_FOUND", "Image not found");
    }
    const current = images[0];
    if (current.id === target.id) {
      return;
    }
    await prisma.$transaction(async (tx) => {
      await productImageRepository.swapSortOrder(tx, current.id, current.sortOrder, target.id, target.sortOrder);
    });
  },
};
