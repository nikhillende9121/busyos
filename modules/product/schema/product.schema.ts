import { z } from "zod";
import { idString } from "@/shared/validation/id";

const productStatusSchema = z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]);

export const createProductSchema = z.object({
  sku: z.string().min(1).max(100),
  barcode: z.string().max(100).optional(),
  name: z.string().min(1).max(200),
  categoryId: idString.optional(),
  brandId: idString.optional(),
  unitId: idString.optional(),
  // GST rate this product is taxed at — see
  // modules/pricing/service/tax.service.ts. Falls back to
  // TenantSetting.defaultTaxRateId when unset.
  taxRateId: idString.optional(),
  status: productStatusSchema.optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

// Same shape as create, all optional — a PUT only changes the fields sent.
export const updateProductSchema = createProductSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["name", "sku", "createdAt"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  status: productStatusSchema.optional(),
  categoryId: idString.optional(),
  search: z.string().max(200).optional(),
  // When set (explicitly, or implied by a warehouse-scoped caller), only
  // products priced for this warehouse are returned — see
  // modules/product/service/product.service.ts's list().
  warehouseId: idString.optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
