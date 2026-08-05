import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../repository/tax.repository", () => ({
  taxRepository: {
    findWarehouseState: vi.fn(),
    findCustomerState: vi.fn(),
    findSupplierState: vi.fn(),
    findTenantSettings: vi.fn(),
    findProductsTaxRateIds: vi.fn(),
    findTaxRatesByIds: vi.fn(),
  },
}));

import { taxRepository } from "../repository/tax.repository";
import { taxService, computeLineTax } from "../service/tax.service";

describe("computeLineTax — pure calculation", () => {
  it("splits into CGST+SGST when the sale is intra-state", () => {
    const result = computeLineTax({
      amount: "1000",
      ratePercent: "18",
      cessPercent: "0",
      taxRateId: 1n,
      context: { isIntraState: true, taxInclusivePricing: false },
    });

    expect(result.taxableAmount).toBe("1000");
    expect(result.components).toEqual([
      { component: "CGST", ratePercent: "9", amount: "90" },
      { component: "SGST", ratePercent: "9", amount: "90" },
    ]);
    expect(result.taxTotal).toBe("180");
  });

  it("uses a single IGST line when the sale is inter-state", () => {
    const result = computeLineTax({
      amount: "1000",
      ratePercent: "18",
      cessPercent: "0",
      taxRateId: 1n,
      context: { isIntraState: false, taxInclusivePricing: false },
    });

    expect(result.components).toEqual([{ component: "IGST", ratePercent: "18", amount: "180" }]);
    expect(result.taxTotal).toBe("180");
  });

  it("adds a separate CESS line on top when the rate has one", () => {
    const result = computeLineTax({
      amount: "1000",
      ratePercent: "28",
      cessPercent: "12",
      taxRateId: 1n,
      context: { isIntraState: false, taxInclusivePricing: false },
    });

    expect(result.components).toEqual([
      { component: "IGST", ratePercent: "28", amount: "280" },
      { component: "CESS", ratePercent: "12", amount: "120" },
    ]);
    expect(result.taxTotal).toBe("400");
  });

  it("backs tax out of an inclusive amount instead of adding it on top", () => {
    // 1180 inclusive at 18% -> taxable 1000, tax 180 — total unchanged.
    const result = computeLineTax({
      amount: "1180",
      ratePercent: "18",
      cessPercent: "0",
      taxRateId: 1n,
      context: { isIntraState: true, taxInclusivePricing: true },
    });

    expect(result.taxableAmount).toBe("1000");
    expect(result.components).toEqual([
      { component: "CGST", ratePercent: "9", amount: "90" },
      { component: "SGST", ratePercent: "9", amount: "90" },
    ]);
    expect(result.taxTotal).toBe("180");
  });

  it("rounds each component to at most 2 decimal places", () => {
    // 333.33 * 9 / 100 = 29.9997 -> rounds to 30 (Prisma.Decimal.toString()
    // strips trailing zeros, so "30" is the correctly-rounded value, not a
    // formatting bug).
    const result = computeLineTax({
      amount: "333.33",
      ratePercent: "18",
      cessPercent: "0",
      taxRateId: 1n,
      context: { isIntraState: true, taxInclusivePricing: false },
    });

    expect(result.components.every((c) => Number.isInteger(Number(c.amount) * 100))).toBe(true);
    expect(result.components[0].amount).toBe("30");
  });
});

describe("taxService.resolveContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves intra-state when warehouse and customer share a state", async () => {
    vi.mocked(taxRepository.findWarehouseState).mockResolvedValue({ state: "Maharashtra" });
    vi.mocked(taxRepository.findCustomerState).mockResolvedValue({ state: "maharashtra" });
    vi.mocked(taxRepository.findTenantSettings).mockResolvedValue({
      homeState: null,
      taxInclusivePricing: false,
      defaultTaxRateId: null,
    });

    const context = await taxService.resolveContext({ tenantId: 1n, warehouseId: 10n, customerId: 20n });

    expect(context.isIntraState).toBe(true);
  });

  it("resolves inter-state when warehouse and customer states differ", async () => {
    vi.mocked(taxRepository.findWarehouseState).mockResolvedValue({ state: "Maharashtra" });
    vi.mocked(taxRepository.findCustomerState).mockResolvedValue({ state: "Delhi" });
    vi.mocked(taxRepository.findTenantSettings).mockResolvedValue({
      homeState: null,
      taxInclusivePricing: false,
      defaultTaxRateId: null,
    });

    const context = await taxService.resolveContext({ tenantId: 1n, warehouseId: 10n, customerId: 20n });

    expect(context.isIntraState).toBe(false);
  });

  it("falls back to TenantSetting.homeState when the warehouse has no state set", async () => {
    vi.mocked(taxRepository.findWarehouseState).mockResolvedValue({ state: null });
    vi.mocked(taxRepository.findCustomerState).mockResolvedValue({ state: "Gujarat" });
    vi.mocked(taxRepository.findTenantSettings).mockResolvedValue({
      homeState: "Gujarat",
      taxInclusivePricing: false,
      defaultTaxRateId: null,
    });

    const context = await taxService.resolveContext({ tenantId: 1n, warehouseId: 10n, customerId: 20n });

    expect(context.isIntraState).toBe(true);
  });

  it("defaults to intra-state when neither side has a configured state", async () => {
    vi.mocked(taxRepository.findWarehouseState).mockResolvedValue({ state: null });
    vi.mocked(taxRepository.findCustomerState).mockResolvedValue({ state: null });
    vi.mocked(taxRepository.findTenantSettings).mockResolvedValue({
      homeState: null,
      taxInclusivePricing: false,
      defaultTaxRateId: null,
    });

    const context = await taxService.resolveContext({ tenantId: 1n, warehouseId: 10n, customerId: 20n });

    expect(context.isIntraState).toBe(true);
  });
});

describe("taxService.resolvePurchaseContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("compares the supplier's state against the receiving warehouse (buyer side)", async () => {
    vi.mocked(taxRepository.findWarehouseState).mockResolvedValue({ state: "Karnataka" });
    vi.mocked(taxRepository.findSupplierState).mockResolvedValue({ state: "Tamil Nadu" });
    vi.mocked(taxRepository.findTenantSettings).mockResolvedValue({
      homeState: null,
      taxInclusivePricing: false,
      defaultTaxRateId: null,
    });

    const context = await taxService.resolvePurchaseContext({ tenantId: 1n, warehouseId: 10n, supplierId: 40n });

    expect(context.isIntraState).toBe(false);
  });

  it("resolves intra-state when the supplier and warehouse share a state", async () => {
    vi.mocked(taxRepository.findWarehouseState).mockResolvedValue({ state: "Karnataka" });
    vi.mocked(taxRepository.findSupplierState).mockResolvedValue({ state: "Karnataka" });
    vi.mocked(taxRepository.findTenantSettings).mockResolvedValue({
      homeState: null,
      taxInclusivePricing: false,
      defaultTaxRateId: null,
    });

    const context = await taxService.resolvePurchaseContext({ tenantId: 1n, warehouseId: 10n, supplierId: 40n });

    expect(context.isIntraState).toBe(true);
  });
});

describe("taxService.computeLinesTax", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const context = { isIntraState: true, taxInclusivePricing: false, defaultTaxRateId: null };

  it("resolves each line's rate from the product, batching lookups", async () => {
    vi.mocked(taxRepository.findProductsTaxRateIds).mockResolvedValue([{ id: 100n, taxRateId: 5n }] as never);
    vi.mocked(taxRepository.findTaxRatesByIds).mockResolvedValue([
      { id: 5n, ratePercent: "18", cessPercent: "0" },
    ] as never);

    const results = await taxService.computeLinesTax(1n, context, [{ productId: 100n, lineTotal: "1000" }]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ taxRateId: "5", taxTotal: "180" });
    expect(taxRepository.findProductsTaxRateIds).toHaveBeenCalledWith(1n, [100n]);
  });

  it("falls back to the tenant default rate when a product has none", async () => {
    vi.mocked(taxRepository.findProductsTaxRateIds).mockResolvedValue([{ id: 100n, taxRateId: null }] as never);
    vi.mocked(taxRepository.findTaxRatesByIds).mockResolvedValue([
      { id: 9n, ratePercent: "5", cessPercent: "0" },
    ] as never);

    const results = await taxService.computeLinesTax(
      1n,
      { ...context, defaultTaxRateId: 9n },
      [{ productId: 100n, lineTotal: "1000" }],
    );

    expect(results[0].taxRateId).toBe("9");
    expect(taxRepository.findTaxRatesByIds).toHaveBeenCalledWith(1n, [9n]);
  });

  it("rejects when a product has no rate and the tenant has no default", async () => {
    vi.mocked(taxRepository.findProductsTaxRateIds).mockResolvedValue([{ id: 100n, taxRateId: null }] as never);

    await expect(
      taxService.computeLinesTax(1n, context, [{ productId: 100n, lineTotal: "1000" }]),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns an empty array without querying anything for zero lines", async () => {
    const results = await taxService.computeLinesTax(1n, context, []);

    expect(results).toEqual([]);
    expect(taxRepository.findProductsTaxRateIds).not.toHaveBeenCalled();
  });
});

describe("taxService.computeChargeTax", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes tax for a charge against its own taxRateId", async () => {
    vi.mocked(taxRepository.findTaxRatesByIds).mockResolvedValue([
      { id: 5n, ratePercent: "18", cessPercent: "0" },
    ] as never);

    const result = await taxService.computeChargeTax(
      1n,
      { isIntraState: false, taxInclusivePricing: false, defaultTaxRateId: null },
      { amount: "50", taxRateId: 5n },
    );

    expect(result).toMatchObject({ taxRateId: "5", taxTotal: "9" });
  });

  it("rejects a taxRateId that doesn't belong to this tenant", async () => {
    vi.mocked(taxRepository.findTaxRatesByIds).mockResolvedValue([]);

    await expect(
      taxService.computeChargeTax(
        1n,
        { isIntraState: true, taxInclusivePricing: false, defaultTaxRateId: null },
        { amount: "50", taxRateId: 999n },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
