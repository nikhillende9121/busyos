import type { Category } from "@prisma/client";
import { categoryRepository } from "../repository/category.repository";
import { AppError } from "@/shared/errors/app-error";
import { uploadImage, destroyImage, cloudinaryImageUrl, CLOUDINARY_TRANSFORM } from "@/shared/utils/cloudinary";
import { assertValidImageFile } from "@/shared/utils/validate-image-file";
import type {
  CreateCategoryDto,
  UpdateCategoryDto,
  UploadCategoryImageDto,
  RemoveCategoryImageDto,
} from "../dto/category.dto";
import type { CategoryView } from "../types/category.types";

export const categoryService = {
  async list(tenantId: bigint): Promise<CategoryView[]> {
    const categories = await categoryRepository.findManyByTenant(tenantId);
    return categories.map(toCategoryView);
  },

  async getById(tenantId: bigint, categoryId: bigint): Promise<CategoryView> {
    const category = await categoryRepository.findByIdForTenant(tenantId, categoryId);
    if (!category) {
      throw new AppError("RESOURCE_NOT_FOUND", "Category not found");
    }
    return toCategoryView(category);
  },

  async create(dto: CreateCategoryDto): Promise<CategoryView> {
    if (dto.parentId !== undefined) {
      await assertParentBelongsToTenant(dto.tenantId, dto.parentId);
    }
    const category = await categoryRepository.create({
      tenantId: dto.tenantId,
      name: dto.name,
      parentId: dto.parentId,
    });
    return toCategoryView(category);
  },

  async update(dto: UpdateCategoryDto): Promise<CategoryView> {
    const existing = await categoryRepository.findByIdForTenant(dto.tenantId, dto.categoryId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Category not found");
    }

    if (dto.parentId !== undefined) {
      if (dto.parentId === dto.categoryId) {
        throw new AppError("VALIDATION_ERROR", "A category cannot be its own parent");
      }
      await assertParentBelongsToTenant(dto.tenantId, dto.parentId);
    }

    const category = await categoryRepository.update(dto.categoryId, {
      name: dto.name,
      parentId: dto.parentId,
    });
    return toCategoryView(category);
  },

  async remove(tenantId: bigint, categoryId: bigint): Promise<void> {
    const existing = await categoryRepository.findByIdForTenant(tenantId, categoryId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Category not found");
    }

    // Blocked, not cascaded: a category with live products or subcategories
    // must be reassigned/removed first — see DATABASE.md -> Foreign Key
    // Rules (Restrict where deleting the parent while children exist
    // should be an error, not a silent cascade).
    const [hasProducts, hasChildren] = await Promise.all([
      categoryRepository.hasProducts(categoryId),
      categoryRepository.hasChildren(categoryId),
    ]);
    if (hasProducts || hasChildren) {
      throw new AppError(
        "CONFLICT",
        "Cannot delete a category that still has products or subcategories",
      );
    }

    await categoryRepository.softDelete(categoryId);
  },

  async uploadImage(dto: UploadCategoryImageDto): Promise<CategoryView> {
    const existing = await categoryRepository.findByIdForTenant(dto.tenantId, dto.categoryId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Category not found");
    }
    assertValidImageFile(dto.file);

    if (existing.imagePublicId) {
      await destroyImage(existing.imagePublicId);
    }
    const buffer = Buffer.from(await dto.file.arrayBuffer());
    const publicId = await uploadImage(buffer, dto.file.type, `tenants/${dto.tenantId}/categories/${dto.categoryId}`);
    const category = await categoryRepository.updateImage(dto.categoryId, publicId);
    return toCategoryView(category);
  },

  async removeImage(dto: RemoveCategoryImageDto): Promise<CategoryView> {
    const existing = await categoryRepository.findByIdForTenant(dto.tenantId, dto.categoryId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Category not found");
    }
    if (!existing.imagePublicId) {
      return toCategoryView(existing);
    }
    await destroyImage(existing.imagePublicId);
    const category = await categoryRepository.updateImage(dto.categoryId, null);
    return toCategoryView(category);
  },
};

async function assertParentBelongsToTenant(tenantId: bigint, parentId: bigint): Promise<void> {
  const parent = await categoryRepository.findByIdForTenant(tenantId, parentId);
  if (!parent) {
    throw new AppError("VALIDATION_ERROR", "parentId does not belong to this tenant");
  }
}

function toCategoryView(category: Category): CategoryView {
  return {
    id: category.id.toString(),
    name: category.name,
    parentId: category.parentId?.toString() ?? null,
    imageUrl: category.imagePublicId
      ? cloudinaryImageUrl(category.imagePublicId, CLOUDINARY_TRANSFORM.thumbnail)
      : null,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}
