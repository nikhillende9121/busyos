import type { Brand } from "@prisma/client";
import { brandRepository } from "../repository/brand.repository";
import { AppError } from "@/shared/errors/app-error";
import { uploadImage, destroyImage, cloudinaryImageUrl, CLOUDINARY_TRANSFORM } from "@/shared/utils/cloudinary";
import { assertValidImageFile } from "@/shared/utils/validate-image-file";
import type { CreateBrandDto, UpdateBrandDto, UploadBrandImageDto, RemoveBrandImageDto } from "../dto/brand.dto";
import type { BrandView } from "../types/brand.types";

export const brandService = {
  async list(tenantId: bigint): Promise<BrandView[]> {
    const brands = await brandRepository.findManyByTenant(tenantId);
    return brands.map(toBrandView);
  },

  async getById(tenantId: bigint, brandId: bigint): Promise<BrandView> {
    const brand = await brandRepository.findByIdForTenant(tenantId, brandId);
    if (!brand) {
      throw new AppError("RESOURCE_NOT_FOUND", "Brand not found");
    }
    return toBrandView(brand);
  },

  async create(dto: CreateBrandDto): Promise<BrandView> {
    const brand = await brandRepository.create({ tenantId: dto.tenantId, name: dto.name });
    return toBrandView(brand);
  },

  async update(dto: UpdateBrandDto): Promise<BrandView> {
    const existing = await brandRepository.findByIdForTenant(dto.tenantId, dto.brandId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Brand not found");
    }
    const brand = await brandRepository.update(dto.brandId, { name: dto.name });
    return toBrandView(brand);
  },

  async remove(tenantId: bigint, brandId: bigint): Promise<void> {
    const existing = await brandRepository.findByIdForTenant(tenantId, brandId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Brand not found");
    }
    const inUse = await brandRepository.hasProducts(brandId);
    if (inUse) {
      throw new AppError("CONFLICT", "Cannot delete a brand that still has products");
    }
    await brandRepository.softDelete(brandId);
  },

  async uploadImage(dto: UploadBrandImageDto): Promise<BrandView> {
    const existing = await brandRepository.findByIdForTenant(dto.tenantId, dto.brandId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Brand not found");
    }
    assertValidImageFile(dto.file);

    if (existing.imagePublicId) {
      await destroyImage(existing.imagePublicId);
    }
    const buffer = Buffer.from(await dto.file.arrayBuffer());
    const publicId = await uploadImage(buffer, dto.file.type, `tenants/${dto.tenantId}/brands/${dto.brandId}`);
    const brand = await brandRepository.updateImage(dto.brandId, publicId);
    return toBrandView(brand);
  },

  async removeImage(dto: RemoveBrandImageDto): Promise<BrandView> {
    const existing = await brandRepository.findByIdForTenant(dto.tenantId, dto.brandId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Brand not found");
    }
    if (!existing.imagePublicId) {
      return toBrandView(existing);
    }
    await destroyImage(existing.imagePublicId);
    const brand = await brandRepository.updateImage(dto.brandId, null);
    return toBrandView(brand);
  },
};

function toBrandView(brand: Brand): BrandView {
  return {
    id: brand.id.toString(),
    name: brand.name,
    imageUrl: brand.imagePublicId ? cloudinaryImageUrl(brand.imagePublicId, CLOUDINARY_TRANSFORM.thumbnail) : null,
    createdAt: brand.createdAt.toISOString(),
    updatedAt: brand.updatedAt.toISOString(),
  };
}
