import { describe, it, expect } from "vitest";
import { computeSalesTrend } from "./compute-sales-trend";
import type { SaleView } from "@/modules/sales/types/sale.types";

function sale(overrides: Partial<SaleView> = {}): SaleView {
  return {
    id: "1",
    customerId: "c1",
    warehouseId: "w1",
    channel: "POS",
    status: "COMPLETED",
    saleDate: "2026-06-15T00:00:00.000Z",
    items: [{ id: "i1", productId: "p1", quantity: "2", price: "100", tax: "0", taxes: [] }],
    discounts: [],
    charges: [],
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
    ...overrides,
  } as SaleView;
}

const NOW = new Date("2026-06-15T12:00:00.000Z");

describe("computeSalesTrend", () => {
  it("buckets a sale's net amount into its exact day, month, and year", () => {
    const result = computeSalesTrend([sale()], NOW);

    expect(result.daily.at(-1)).toEqual({ label: "2026-06-15", revenue: 200 });
    expect(result.monthly.at(-1)).toEqual({ label: "2026-06", revenue: 200 });
    expect(result.yearly.at(-1)).toEqual({ label: "2026", revenue: 200 });
  });

  it("excludes non-revenue-eligible statuses", () => {
    const result = computeSalesTrend([sale({ status: "DRAFT" }), sale({ status: "CANCELLED" })], NOW);

    expect(result.daily.at(-1)).toEqual({ label: "2026-06-15", revenue: 0 });
  });

  it("nets out discounts, matching buildDashboardInsights' revenue definition", () => {
    const result = computeSalesTrend(
      [
        sale({
          items: [{ id: "i1", productId: "p1", quantity: "1", price: "100", tax: "0", taxes: [] }],
          discounts: [{ id: "d1", saleItemId: "i1", discountId: "1", couponId: null, amount: "15" }],
        }),
      ],
      NOW,
    );

    expect(result.daily.at(-1)?.revenue).toBe(85);
  });

  it("zero-fills every day in the 30-day window, not just days with a sale", () => {
    const result = computeSalesTrend([sale()], NOW);

    expect(result.daily).toHaveLength(30);
    expect(result.daily[0].label).toBe("2026-05-17"); // 29 days before 2026-06-15
    expect(result.daily[0].revenue).toBe(0);
  });

  it("zero-fills every month in the 12-month window, oldest first", () => {
    const result = computeSalesTrend([], NOW);

    expect(result.monthly).toHaveLength(12);
    expect(result.monthly[0].label).toBe("2025-07");
    expect(result.monthly.at(-1)?.label).toBe("2026-06");
    expect(result.monthly.every((point) => point.revenue === 0)).toBe(true);
  });

  it("zero-fills every year in the 5-year window, oldest first, including the current year", () => {
    const result = computeSalesTrend([], NOW);

    expect(result.yearly.map((point) => point.label)).toEqual(["2022", "2023", "2024", "2025", "2026"]);
  });

  it("aggregates multiple sales on the same day into one bucket", () => {
    const result = computeSalesTrend(
      [
        sale({ id: "1", items: [{ id: "i1", productId: "p1", quantity: "1", price: "50", tax: "0", taxes: [] }] }),
        sale({ id: "2", items: [{ id: "i2", productId: "p1", quantity: "1", price: "30", tax: "0", taxes: [] }] }),
      ],
      NOW,
    );

    expect(result.daily.at(-1)?.revenue).toBe(80);
  });
});
