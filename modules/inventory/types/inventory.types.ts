import type { ProductView } from "@/modules/product/types/product.types";

// Quantity is a string, not a number: it's a Prisma Decimal underneath
// (see prisma/schema.prisma -> InventoryBalance/InventoryTransaction), and a
// JS number would lose precision exactly the way it would for a bigint id.
export type InventoryBalanceView = {
  warehouseId: string;
  productId: string;
  quantity: string;
  updatedAt: string;
  // null only if the product was soft-deleted after this balance row was
  // created — the normal case is always a populated product, image URLs
  // included via product.images (see modules/product/service/
  // product-image-view.mapper.ts).
  product: ProductView | null;
  // The same per-warehouse "buy 1" price the store checkout screen shows
  // (modules/pricing/service/price-list.service.ts's resolveBuyOnePriceMap).
  // null if no price list configures this product for this warehouse.
  price: string | null;
};

export type StockAdjustmentView = {
  id: string;
  warehouseId: string;
  reason: string;
  items: {
    productId: string;
    quantityDelta: string;
  }[];
  createdAt: string;
};
