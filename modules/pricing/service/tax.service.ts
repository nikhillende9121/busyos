import { Prisma } from "@prisma/client";
import { taxRepository } from "../repository/tax.repository";
import { AppError } from "@/shared/errors/app-error";
import type { TaxContextInput, PurchaseTaxContextInput, TaxLineInput, TaxChargeInput } from "../dto/tax.dto";
import type { TaxContext, LineTaxResult, TaxComponentResult } from "../types/tax.types";

// The GST calculation engine — see Docs/business-rules/taxation.md. Order of
// operations (Docs/business-rules/discounts-and-coupons.md): price ->
// discounts -> coupon -> HERE. Callers pass the already-discounted
// promotionService.quote() lineTotal in; this module never touches
// price/discount logic.
export const taxService = {
  // Resolved once per sale/purchase, then reused for every line + charge —
  // the seller/buyer state comparison and tax-inclusive flag don't vary
  // per line.
  async resolveContext(input: TaxContextInput): Promise<TaxContext> {
    const [warehouse, customer, settings] = await Promise.all([
      taxRepository.findWarehouseState(input.tenantId, input.warehouseId),
      taxRepository.findCustomerState(input.tenantId, input.customerId),
      taxRepository.findTenantSettings(input.tenantId),
    ]);

    return {
      isIntraState: resolveIsIntraState(warehouse?.state ?? null, settings?.homeState ?? null, customer?.state ?? null),
      taxInclusivePricing: settings?.taxInclusivePricing ?? false,
      defaultTaxRateId: settings?.defaultTaxRateId ?? null,
    };
  },

  // Same shape as resolveContext, but the seller/buyer roles are reversed
  // (Supplier sells, the receiving Warehouse/tenant buys) — see
  // Docs/business-rules/taxation.md.
  async resolvePurchaseContext(input: PurchaseTaxContextInput): Promise<TaxContext> {
    const [warehouse, supplier, settings] = await Promise.all([
      taxRepository.findWarehouseState(input.tenantId, input.warehouseId),
      taxRepository.findSupplierState(input.tenantId, input.supplierId),
      taxRepository.findTenantSettings(input.tenantId),
    ]);

    return {
      isIntraState: resolveIsIntraState(warehouse?.state ?? null, settings?.homeState ?? null, supplier?.state ?? null),
      taxInclusivePricing: settings?.taxInclusivePricing ?? false,
      defaultTaxRateId: settings?.defaultTaxRateId ?? null,
    };
  },

  // Resolves each line's tax rate (Product.taxRateId -> tenant default ->
  // error) and computes its CGST+SGST/IGST(+CESS) breakdown. Batches the
  // product and tax-rate lookups so N lines cost 2 queries, not 2N.
  async computeLinesTax(tenantId: bigint, context: TaxContext, lines: TaxLineInput[]): Promise<LineTaxResult[]> {
    if (lines.length === 0) return [];

    const productIds = [...new Set(lines.map((line) => line.productId.toString()))].map((id) => BigInt(id));
    const products = await taxRepository.findProductsTaxRateIds(tenantId, productIds);
    const productTaxRateById = new Map(products.map((product) => [product.id.toString(), product.taxRateId]));

    const resolvedRateIds = lines.map((line) => {
      const productRateId = productTaxRateById.get(line.productId.toString()) ?? null;
      const rateId = productRateId ?? context.defaultTaxRateId;
      if (!rateId) {
        throw new AppError(
          "VALIDATION_ERROR",
          `No tax rate configured for product ${line.productId.toString()}, and the tenant has no default tax rate set`,
        );
      }
      return rateId;
    });

    const uniqueRateIds = [...new Set(resolvedRateIds.map((id) => id.toString()))].map((id) => BigInt(id));
    const taxRates = await taxRepository.findTaxRatesByIds(tenantId, uniqueRateIds);
    const taxRateById = new Map(taxRates.map((rate) => [rate.id.toString(), rate]));

    return lines.map((line, index) => {
      const rateId = resolvedRateIds[index];
      const rate = taxRateById.get(rateId.toString());
      if (!rate) {
        throw new AppError("VALIDATION_ERROR", "Resolved tax rate does not belong to this tenant");
      }
      return computeLineTax({
        amount: line.lineTotal,
        ratePercent: rate.ratePercent,
        cessPercent: rate.cessPercent,
        taxRateId: rate.id,
        context,
      });
    });
  },

  // Extra charges already know their taxRateId (set on the ExtraCharge
  // catalog entry) — no product lookup needed, just the one rate.
  async computeChargeTax(tenantId: bigint, context: TaxContext, charge: TaxChargeInput): Promise<LineTaxResult> {
    const [rate] = await taxRepository.findTaxRatesByIds(tenantId, [charge.taxRateId]);
    if (!rate) {
      throw new AppError("VALIDATION_ERROR", "Resolved tax rate does not belong to this tenant");
    }
    return computeLineTax({
      amount: charge.amount,
      ratePercent: rate.ratePercent,
      cessPercent: rate.cessPercent,
      taxRateId: rate.id,
      context,
    });
  },
};

// Same state (case/whitespace-insensitive) -> intra-state. Neither side
// configured a state -> defaults to intra-state (CGST+SGST) rather than
// erroring: GST correctness depends on the tenant configuring
// Warehouse.state/Customer.state/TenantSetting.homeState, but an
// unconfigured tenant shouldn't be blocked from selling at all — see
// Docs/business-rules/taxation.md.
function resolveIsIntraState(
  warehouseState: string | null,
  homeState: string | null,
  customerState: string | null,
): boolean {
  const sellerState = warehouseState ?? homeState;
  if (!sellerState || !customerState) {
    return true;
  }
  return sellerState.trim().toLowerCase() === customerState.trim().toLowerCase();
}

// Pure, exported for direct unit testing without mocking the repository.
export function computeLineTax(params: {
  amount: string;
  ratePercent: Prisma.Decimal | string;
  cessPercent: Prisma.Decimal | string;
  taxRateId: bigint;
  context: Pick<TaxContext, "isIntraState" | "taxInclusivePricing">;
}): LineTaxResult {
  const amount = new Prisma.Decimal(params.amount);
  const ratePercent = new Prisma.Decimal(params.ratePercent);
  const cessPercent = new Prisma.Decimal(params.cessPercent);
  const combinedRatePercent = ratePercent.add(cessPercent);

  // Tax-inclusive: `amount` already contains the tax, so back it out
  // before computing each component — the grand total stays the same
  // either way, only the taxable-value/tax split differs. See
  // Docs/business-rules/pricing.md's tax-inclusive/exclusive decision.
  const taxableAmount = params.context.taxInclusivePricing
    ? amount.div(combinedRatePercent.div(100).add(1))
    : amount;

  const components: TaxComponentResult[] = [];
  if (params.context.isIntraState) {
    const halfRate = ratePercent.div(2);
    const halfAmount = round2(taxableAmount.mul(halfRate).div(100));
    components.push({ component: "CGST", ratePercent: halfRate.toString(), amount: halfAmount.toString() });
    components.push({ component: "SGST", ratePercent: halfRate.toString(), amount: halfAmount.toString() });
  } else {
    components.push({
      component: "IGST",
      ratePercent: ratePercent.toString(),
      amount: round2(taxableAmount.mul(ratePercent).div(100)).toString(),
    });
  }
  if (cessPercent.greaterThan(0)) {
    components.push({
      component: "CESS",
      ratePercent: cessPercent.toString(),
      amount: round2(taxableAmount.mul(cessPercent).div(100)).toString(),
    });
  }

  const taxTotal = components.reduce((sum, component) => sum.add(component.amount), new Prisma.Decimal(0));

  return {
    taxRateId: params.taxRateId.toString(),
    taxableAmount: round2(taxableAmount).toString(),
    components,
    taxTotal: taxTotal.toString(),
  };
}

function round2(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
