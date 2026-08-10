import { Prisma } from "@prisma/client";
import type { Product, ProductImage } from "@prisma/client";
import { productRepository } from "../repository/product.repository";
import { AppError } from "@/shared/errors/app-error";
import { buildPagination, type Paginated } from "@/shared/utils/pagination";
import { toProductImageView } from "./product-image-view.mapper";
import type { CreateProductDto, UpdateProductDto, ProductListDto } from "../dto/product.dto";
import type { ProductView } from "../types/product.types";

export const productService = {
  async list(filter: ProductListDto): Promise<Paginated<ProductView>> {
    const skip = (filter.page - 1) * filter.pageSize;
    const [items, total] = await Promise.all([
      productRepository.findManyByTenant(filter.tenantId, { ...filter, skip, take: filter.pageSize }),
      productRepository.countByTenant(filter.tenantId, filter),
    ]);
    return {
      items: items.map(toProductView),
      pagination: buildPagination(filter.page, filter.pageSize, total),
    };
  },

  async getById(tenantId: bigint, productId: bigint): Promise<ProductView> {
    const product = await productRepository.findByIdForTenant(tenantId, productId);
    if (!product) {
      throw new AppError("RESOURCE_NOT_FOUND", "Product not found");
    }
    return toProductView(product);
  },

  // For callers that already have a set of productIds from elsewhere (e.g.
  // inventory balance rows) and need product details attached in bulk,
  // rather than one getById call per row.
  async getManyByIds(tenantId: bigint, productIds: bigint[]): Promise<ProductView[]> {
    if (productIds.length === 0) return [];
    const products = await productRepository.findManyByIds(tenantId, productIds);
    return products.map(toProductView);
  },

  async create(dto: CreateProductDto): Promise<ProductView> {
    await assertReferencesBelongToTenant(dto.tenantId, dto);
    try {
      const product = await productRepository.create({
        tenantId: dto.tenantId,
        sku: dto.sku,
        barcode: dto.barcode,
        name: dto.name,
        categoryId: dto.categoryId,
        brandId: dto.brandId,
        unitId: dto.unitId,
        taxRateId: dto.taxRateId,
        status: dto.status,
        createdBy: dto.createdBy,
      });
      return toProductView(product);
    } catch (error) {
      throw toDuplicateKeyError(error);
    }
  },

  async update(dto: UpdateProductDto): Promise<ProductView> {
    const existing = await productRepository.findByIdForTenant(dto.tenantId, dto.productId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Product not found");
    }
    await assertReferencesBelongToTenant(dto.tenantId, dto);
    try {
      const product = await productRepository.update(dto.productId, {
        sku: dto.sku,
        barcode: dto.barcode,
        name: dto.name,
        categoryId: dto.categoryId,
        brandId: dto.brandId,
        unitId: dto.unitId,
        taxRateId: dto.taxRateId,
        status: dto.status,
        updatedBy: dto.updatedBy,
      });
      return toProductView(product);
    } catch (error) {
      throw toDuplicateKeyError(error);
    }
  },

  async remove(tenantId: bigint, productId: bigint, deletedBy?: bigint): Promise<void> {
    const existing = await productRepository.findByIdForTenant(tenantId, productId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Product not found");
    }
    await productRepository.softDelete(productId, deletedBy);
  },
};

// A category/brand/unit id from another tenant would otherwise attach
// happily — Prisma's FK constraint only checks the row exists, not that it
// matches tenantId. Checked before every write, not just on create, since
// an update can just as easily re-point a product at another tenant's data.
async function assertReferencesBelongToTenant(
  tenantId: bigint,
  refs: { categoryId?: bigint; brandId?: bigint; unitId?: bigint; taxRateId?: bigint },
): Promise<void> {
  if (refs.categoryId !== undefined) {
    const belongs = await productRepository.categoryBelongsToTenant(tenantId, refs.categoryId);
    if (!belongs) {
      throw new AppError("VALIDATION_ERROR", "categoryId does not belong to this tenant");
    }
  }
  if (refs.brandId !== undefined) {
    const belongs = await productRepository.brandBelongsToTenant(tenantId, refs.brandId);
    if (!belongs) {
      throw new AppError("VALIDATION_ERROR", "brandId does not belong to this tenant");
    }
  }
  if (refs.unitId !== undefined) {
    const belongs = await productRepository.unitBelongsToTenant(tenantId, refs.unitId);
    if (!belongs) {
      throw new AppError("VALIDATION_ERROR", "unitId does not belong to this tenant");
    }
  }
  if (refs.taxRateId !== undefined) {
    const belongs = await productRepository.taxRateBelongsToTenant(tenantId, refs.taxRateId);
    if (!belongs) {
      throw new AppError("VALIDATION_ERROR", "taxRateId does not belong to this tenant");
    }
  }
}

// Prisma raises the same P2002 code for both the (tenantId, sku) and
// (tenantId, barcode) unique constraints (see prisma/schema.prisma ->
// Product); meta.target names the actual column so the error is specific
// rather than a generic "duplicate".
function toDuplicateKeyError(error: unknown): AppError {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = (error.meta?.target as string[] | undefined)?.join(",") ?? "";
    if (target.includes("barcode")) {
      return new AppError("DUPLICATE_BARCODE", "A product with this barcode already exists");
    }
    return new AppError("DUPLICATE_SKU", "A product with this SKU already exists");
  }
  return error instanceof AppError ? error : new AppError("INTERNAL_ERROR", "Unexpected error");
}

function toProductView(product: Product & { images?: ProductImage[] }): ProductView {
  return {
    id: product.id.toString(),
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    status: product.status,
    categoryId: product.categoryId?.toString() ?? null,
    brandId: product.brandId?.toString() ?? null,
    unitId: product.unitId?.toString() ?? null,
    taxRateId: product.taxRateId?.toString() ?? null,
    images: (product.images ?? []).map(toProductImageView),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
