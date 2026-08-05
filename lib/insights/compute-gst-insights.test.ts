import { describe, it, expect } from "vitest";
import { computeGstInsights } from "./compute-gst-insights";

const PERIOD_START = new Date("2026-01-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-01-31T23:59:59.999Z");

const TAX_RATE_18 = { id: "5", name: "GST 18%", hsnCode: "1006", sacCode: null, ratePercent: "18", cessPercent: "0", isActive: true, createdAt: "", updatedAt: "" };

function saleWithTax(overrides: { saleDate?: string; taxes?: { taxRateId: string | null; component: string; ratePercent: string; amount: string }[]; price?: string; quantity?: string } = {}) {
  return {
    id: "1",
    customerId: "c1",
    warehouseId: "w1",
    channel: "POS",
    status: "COMPLETED",
    saleDate: overrides.saleDate ?? "2026-01-15T00:00:00.000Z",
    items: [
      {
        id: "i1",
        productId: "p1",
        quantity: overrides.quantity ?? "1",
        price: overrides.price ?? "1000",
        tax: "180",
        taxes: overrides.taxes ?? [
          { taxRateId: "5", component: "CGST", ratePercent: "9", amount: "90" },
          { taxRateId: "5", component: "SGST", ratePercent: "9", amount: "90" },
        ],
      },
    ],
    discounts: [],
    charges: [],
    createdAt: "",
    updatedAt: "",
  };
}

function purchaseWithTax(overrides: { purchaseDate?: string; amount?: string } = {}) {
  return {
    id: "1",
    supplierId: "s1",
    warehouseId: "w1",
    status: "RECEIVED",
    purchaseDate: overrides.purchaseDate ?? "2026-01-10T00:00:00.000Z",
    items: [
      {
        id: "i1",
        productId: "p1",
        quantity: "1",
        receivedQuantity: "1",
        price: "500",
        tax: "90",
        taxes: [{ taxRateId: "5", component: "IGST", ratePercent: "18", amount: overrides.amount ?? "90" }],
      },
    ],
    charges: [],
    createdAt: "",
    updatedAt: "",
  };
}

describe("computeGstInsights", () => {
  it("sums output tax from sales and input tax from purchases within the period", () => {
    const insights = computeGstInsights({
      sales: [saleWithTax() as never],
      purchases: [purchaseWithTax() as never],
      taxRates: [TAX_RATE_18],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    expect(insights.outputTax).toBe(180);
    expect(insights.inputTax).toBe(90);
    expect(insights.netPayable).toBe(90);
  });

  it("splits output tax by component (CGST/SGST/IGST/CESS)", () => {
    const insights = computeGstInsights({
      sales: [saleWithTax() as never],
      purchases: [],
      taxRates: [TAX_RATE_18],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    expect(insights.outputByComponent).toEqual({ cgst: 90, sgst: 90, igst: 0, cess: 0 });
  });

  it("excludes sales and purchases outside the period", () => {
    const insights = computeGstInsights({
      sales: [saleWithTax({ saleDate: "2025-12-31T00:00:00.000Z" }) as never],
      purchases: [purchaseWithTax({ purchaseDate: "2026-02-01T00:00:00.000Z" }) as never],
      taxRates: [TAX_RATE_18],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    expect(insights.outputTax).toBe(0);
    expect(insights.inputTax).toBe(0);
  });

  it("builds an HSN/rate-wise breakdown for output tax, recovering taxable value from the rate", () => {
    const insights = computeGstInsights({
      sales: [saleWithTax({ price: "1000", quantity: "1" }) as never],
      purchases: [],
      taxRates: [TAX_RATE_18],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    expect(insights.rateBreakdown).toEqual([
      {
        taxRateId: "5",
        name: "GST 18%",
        hsnCode: "1006",
        sacCode: null,
        taxableValue: 1000,
        cgst: 90,
        sgst: 90,
        igst: 0,
        cess: 0,
        total: 180,
      },
    ]);
  });

  it("groups an inter-state (IGST) line into the same rate bucket as an intra-state one", () => {
    const insights = computeGstInsights({
      sales: [
        saleWithTax({ price: "1000" }) as never,
        saleWithTax({
          price: "1000",
          taxes: [{ taxRateId: "5", component: "IGST", ratePercent: "18", amount: "180" }],
        }) as never,
      ],
      purchases: [],
      taxRates: [TAX_RATE_18],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    expect(insights.rateBreakdown).toHaveLength(1);
    expect(insights.rateBreakdown[0].total).toBe(360);
    expect(insights.rateBreakdown[0].taxableValue).toBe(2000);
  });

  it("returns zero totals and an empty breakdown for no data", () => {
    const insights = computeGstInsights({
      sales: [],
      purchases: [],
      taxRates: [],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    expect(insights.outputTax).toBe(0);
    expect(insights.inputTax).toBe(0);
    expect(insights.netPayable).toBe(0);
    expect(insights.rateBreakdown).toEqual([]);
  });
});
