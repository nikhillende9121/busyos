export type DiscountView = {
  id: string;
  name: string;
  type: string;
  value: string;
  scope: string;
  warehouseId: string | null;
  customerGroupId: string | null;
  customerId: string | null;
  productIds: string[];
  categoryIds: string[];
  minPurchaseAmount: string | null;
  maxDiscountAmount: string | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  stackable: boolean;
  priority: number;
};
