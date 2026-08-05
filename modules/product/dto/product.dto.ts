import type { ProductStatus } from "@prisma/client";

export type CreateProductDto = {
  tenantId: bigint;
  sku: string;
  barcode?: string;
  name: string;
  categoryId?: bigint;
  brandId?: bigint;
  unitId?: bigint;
  taxRateId?: bigint;
  status?: ProductStatus;
  createdBy?: bigint;
};

export type UpdateProductDto = {
  tenantId: bigint;
  productId: bigint;
  sku?: string;
  barcode?: string;
  name?: string;
  categoryId?: bigint;
  brandId?: bigint;
  unitId?: bigint;
  taxRateId?: bigint;
  status?: ProductStatus;
  updatedBy?: bigint;
};

export type ProductListDto = {
  tenantId: bigint;
  page: number;
  pageSize: number;
  sortBy: "name" | "sku" | "createdAt";
  sortDir: "asc" | "desc";
  status?: ProductStatus;
  categoryId?: bigint;
  search?: string;
};
