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
  // When set (explicitly, or via scopedWarehouseId below), the list is
  // restricted to products priced for this warehouse — see
  // product.service.ts's list().
  warehouseId?: bigint;
  // The caller's warehouse scope (see Docs/business-rules/roles-and-permissions.md
  // -> Warehouse-Scoped Users), not business data — null/omitted means
  // unrestricted.
  scopedWarehouseId?: bigint | null;
};
