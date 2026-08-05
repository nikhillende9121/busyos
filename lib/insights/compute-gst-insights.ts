import type { SaleView } from "@/modules/sales/types/sale.types";
import type { PurchaseView } from "@/modules/purchase/types/purchase.types";
import type { TaxRateView } from "@/modules/tax-rate/types/tax-rate.types";

// Pure aggregation over data the caller already fetches — no new backend
// endpoint. Neither /sales nor /purchases support a date-range filter
// today, so the period is applied here, client-side, over the full
// (unpaginated) list — same "compute over already-fetched data" philosophy
// as lib/insights/compute-insights.ts.

export type GstComponentTotals = { cgst: number; sgst: number; igst: number; cess: number };

// The exact shape GSTR-1's "HSN-wise summary" section needs — output tax
// only (sales), grouped by the actual TaxRate/HSN, not just by percentage
// (two different HSN codes can share the same %).
export type GstRateBreakdown = {
  taxRateId: string;
  name: string;
  hsnCode: string | null;
  sacCode: string | null;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
};

export type GstInsights = {
  outputTax: number;
  inputTax: number;
  netPayable: number;
  outputByComponent: GstComponentTotals;
  inputByComponent: GstComponentTotals;
  rateBreakdown: GstRateBreakdown[];
};

export type GstInsightsInput = {
  sales: SaleView[];
  purchases: PurchaseView[];
  taxRates: TaxRateView[];
  periodStart: Date;
  periodEnd: Date;
};

function zeroComponents(): GstComponentTotals {
  return { cgst: 0, sgst: 0, igst: 0, cess: 0 };
}

function addComponent(totals: GstComponentTotals, component: string, amount: number): void {
  if (component === "CGST") totals.cgst += amount;
  else if (component === "SGST") totals.sgst += amount;
  else if (component === "IGST") totals.igst += amount;
  else if (component === "CESS") totals.cess += amount;
}

function inPeriod(dateIso: string, start: Date, end: Date): boolean {
  const date = new Date(dateIso);
  return date >= start && date <= end;
}

export function computeGstInsights(input: GstInsightsInput): GstInsights {
  const { periodStart, periodEnd } = input;
  const taxRateById = new Map(input.taxRates.map((rate) => [rate.id, rate]));

  const outputByComponent = zeroComponents();
  const rateBreakdownById = new Map<string, GstRateBreakdown>();

  const salesInPeriod = input.sales.filter((sale) => inPeriod(sale.saleDate, periodStart, periodEnd));
  for (const sale of salesInPeriod) {
    for (const item of sale.items) {
      for (const tax of item.taxes) {
        const amount = Number(tax.amount);
        addComponent(outputByComponent, tax.component, amount);

        if (!tax.taxRateId) continue;
        const rate = taxRateById.get(tax.taxRateId);
        const bucket = rateBreakdownById.get(tax.taxRateId) ?? {
          taxRateId: tax.taxRateId,
          name: rate?.name ?? `Tax rate #${tax.taxRateId}`,
          hsnCode: rate?.hsnCode ?? null,
          sacCode: rate?.sacCode ?? null,
          taxableValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          cess: 0,
          total: 0,
        };
        addComponent(bucket, tax.component, amount);
        bucket.total += amount;
        rateBreakdownById.set(tax.taxRateId, bucket);
      }
    }
  }

  // Taxable value isn't itself a persisted column on SaleItem (only the
  // resulting CGST/SGST/IGST/CESS amounts are) — recovered per item as
  // taxTotal / (combinedRatePercent / 100), which holds regardless of
  // whether the line split into 2 rows (CGST+SGST) or stayed 1 (IGST),
  // since combinedRatePercent is the sum of every row's own rate either way.
  for (const sale of salesInPeriod) {
    for (const item of sale.items) {
      if (item.taxes.length === 0) continue;
      const taxRateId = item.taxes[0].taxRateId;
      if (!taxRateId) continue;
      const bucket = rateBreakdownById.get(taxRateId);
      if (!bucket) continue;
      const combinedRatePercent = item.taxes.reduce((sum, tax) => sum + Number(tax.ratePercent), 0);
      const lineTaxTotal = item.taxes.reduce((sum, tax) => sum + Number(tax.amount), 0);
      if (combinedRatePercent > 0) {
        bucket.taxableValue += (lineTaxTotal / combinedRatePercent) * 100;
      }
    }
  }

  const inputByComponent = zeroComponents();
  const purchasesInPeriod = input.purchases.filter((purchase) =>
    inPeriod(purchase.purchaseDate, periodStart, periodEnd),
  );
  for (const purchase of purchasesInPeriod) {
    for (const item of purchase.items) {
      for (const tax of item.taxes) {
        addComponent(inputByComponent, tax.component, Number(tax.amount));
      }
    }
  }

  const outputTax = outputByComponent.cgst + outputByComponent.sgst + outputByComponent.igst + outputByComponent.cess;
  const inputTax = inputByComponent.cgst + inputByComponent.sgst + inputByComponent.igst + inputByComponent.cess;

  return {
    outputTax,
    inputTax,
    netPayable: outputTax - inputTax,
    outputByComponent,
    inputByComponent,
    rateBreakdown: [...rateBreakdownById.values()].sort((a, b) => b.total - a.total),
  };
}
