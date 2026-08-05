export type PriceListItemView = {
  id: string;
  productId: string;
  price: string;
  minQuantity: string;
};

export type PriceListView = {
  id: string;
  name: string;
  warehouseId: string | null;
  customerGroupId: string | null;
  customerId: string | null;
  currency: string;
  isDefault: boolean;
  items: PriceListItemView[];
  createdAt: string;
};

export type ResolvedPriceView = {
  priceListId: string;
  price: string;
};
