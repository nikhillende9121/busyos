export type TaxContextInput = {
  tenantId: bigint;
  warehouseId: bigint;
  customerId: bigint;
};

// Purchases reverse the seller/buyer roles from a sale: the Supplier is the
// seller, the receiving Warehouse (or the tenant's homeState fallback) is
// the buyer — this is what makes CGST+SGST-vs-IGST an input-tax-credit
// question instead of an output-tax one.
export type PurchaseTaxContextInput = {
  tenantId: bigint;
  warehouseId: bigint;
  supplierId: bigint;
};

export type TaxLineInput = {
  productId: bigint;
  // Post-discount amount for this line (the same figure
  // promotionService.quote() calls lineTotal) — exclusive if
  // TenantSetting.taxInclusivePricing is false, inclusive-of-tax if true.
  lineTotal: string;
};

export type TaxChargeInput = {
  // Pre-resolved charge amount (flat, or already-computed percentage) —
  // the caller (sale/purchase service) resolves this from the ExtraCharge
  // catalog before calling in.
  amount: string;
  taxRateId: bigint;
};
