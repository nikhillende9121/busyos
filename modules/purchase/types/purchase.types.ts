// Server-computed breakdown (see modules/pricing/service/tax.service.ts) —
// 2 rows for an intra-state line (CGST+SGST), 1 for inter-state (IGST),
// +1 more if the resolved TaxRate has a non-zero cessPercent.
export type PurchaseItemTaxView = {
  taxRateId: string | null;
  component: string;
  ratePercent: string;
  amount: string;
};

export type PurchaseItemView = {
  id: string;
  productId: string;
  quantity: string;
  receivedQuantity: string;
  price: string;
  tax: string;
  taxes: PurchaseItemTaxView[];
};

// Invoice-level charge (freight/handling — not tax), snapshot of an
// ExtraCharge catalog entry at the time it was attached to this purchase.
export type PurchaseChargeView = {
  id: string;
  name: string;
  amount: string;
  taxAmount: string;
};

export type PurchaseView = {
  id: string;
  supplierId: string;
  warehouseId: string;
  status: string;
  purchaseDate: string;
  items: PurchaseItemView[];
  charges: PurchaseChargeView[];
  createdAt: string;
  updatedAt: string;
};
