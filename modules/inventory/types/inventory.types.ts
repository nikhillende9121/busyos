// Quantity is a string, not a number: it's a Prisma Decimal underneath
// (see prisma/schema.prisma -> InventoryBalance/InventoryTransaction), and a
// JS number would lose precision exactly the way it would for a bigint id.
export type InventoryBalanceView = {
  warehouseId: string;
  productId: string;
  quantity: string;
  updatedAt: string;
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
