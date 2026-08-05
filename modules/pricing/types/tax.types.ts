export type TaxContext = {
  // Same state on both sides of the sale -> CGST+SGST; different -> IGST.
  // See modules/pricing/service/tax.service.ts's resolveIsIntraState.
  isIntraState: boolean;
  taxInclusivePricing: boolean;
  defaultTaxRateId: bigint | null;
};

export type TaxComponentResult = {
  component: "CGST" | "SGST" | "IGST" | "CESS";
  ratePercent: string;
  amount: string;
};

export type LineTaxResult = {
  taxRateId: string;
  // The value tax was actually computed against — equal to the line's
  // post-discount total when pricing is tax-exclusive, or that total with
  // tax backed out when tax-inclusive.
  taxableAmount: string;
  components: TaxComponentResult[];
  taxTotal: string;
};
