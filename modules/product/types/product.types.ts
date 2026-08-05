import type { ProductImageView } from "./product-image.types";

// Response shape returned to clients — not the raw Prisma Product row (see
// MODULES.md -> types/). Ids are strings for the same reason as everywhere
// else: BigInt doesn't round-trip through JSON as a number.
export type ProductView = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  status: string;
  categoryId: string | null;
  brandId: string | null;
  unitId: string | null;
  taxRateId: string | null;
  // Ordered by sortOrder ascending — images[0] is the primary/thumbnail
  // (see modules/product/service/product-image.service.ts).
  images: ProductImageView[];
  createdAt: string;
  updatedAt: string;
};
