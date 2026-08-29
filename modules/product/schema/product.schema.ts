import { z } from "zod";
import { idString, optionalIdString } from "@/shared/validation/id";
import { dateRangeQueryFields } from "@/shared/validation/list-query";

const productStatusSchema = z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]);

export const createProductSchema = z.object({
  sku: z.string().min(1).max(100),
  barcode: z.string().max(100).optional(),
  name: z.string().min(1).max(200),
  categoryId: optionalIdString,
  brandId: optionalIdString,
  unitId: optionalIdString,
  // GST rate this product is taxed at — see
  // modules/pricing/service/tax.service.ts. Falls back to
  // TenantSetting.defaultTaxRateId when unset.
  taxRateId: optionalIdString,
  status: productStatusSchema.optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

// Same shape as create, all optional — a PUT only changes the fields sent.
export const updateProductSchema = createProductSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

const productListFilterFields = {
  status: productStatusSchema.optional(),
  categoryId: optionalIdString,
  search: z.string().max(200).optional(),
  // When set (explicitly, or implied by a warehouse-scoped caller), only
  // products priced for this warehouse are returned — see
  // modules/product/service/product.service.ts's list().
  warehouseId: optionalIdString,
  // When true, bypasses warehouse price-list scoping (e.g. for purchase creation)
  all: z.coerce.boolean().optional(),
};

// dateFrom/dateTo filter on createdAt.
export const listProductsQuerySchema = z.object({
  ...productListFilterFields,
  ...dateRangeQueryFields,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["name", "sku", "createdAt"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

// Same filters as the list, minus pagination/sort — see
// Docs/API_STANDARDS.md -> List Export.
export const exportProductsQuerySchema = z.object({
  ...productListFilterFields,
  ...dateRangeQueryFields,
});
export type ExportProductsQuery = z.infer<typeof exportProductsQuerySchema>;
