import { describe, it, expect } from "vitest";
import { buildDashboardInsights, LOW_STOCK_THRESHOLD, type DashboardInsightsInput } from "./compute-insights";

function sale(overrides: Partial<DashboardInsightsInput["sales"][number]> = {}): DashboardInsightsInput["sales"][number] {
  return {
    id: "1",
    customerId: "c1",
    warehouseId: "w1",
    channel: "POS",
    status: "COMPLETED",
    saleDate: "2026-01-01T00:00:00.000Z",
    items: [{ id: "i1", productId: "p1", quantity: "2", price: "100", tax: "0", taxes: [] }],
    discounts: [],
    charges: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function purchase(overrides: Partial<DashboardInsightsInput["purchases"][number]> = {}): DashboardInsightsInput["purchases"][number] {
  return {
    id: "1",
    supplierId: "s1",
    warehouseId: "w1",
    status: "ORDERED",
    purchaseDate: "2026-01-01T00:00:00.000Z",
    items: [],
    charges: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseInput(overrides: Partial<DashboardInsightsInput> = {}): DashboardInsightsInput {
  return {
    sales: [],
    purchases: [],
    products: { items: [{ id: "p1", sku: "SKU1", barcode: null, name: "Widget", status: "ACTIVE", categoryId: null, brandId: null, unitId: null, taxRateId: null, images: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } },
    balances: [],
    customers: [{ id: "c1", name: "Alice", email: null, phone: null, customerGroupId: null, state: null, createdAt: "", updatedAt: "" }],
    suppliers: [{ id: "s1", name: "Acme", email: null, phone: null, state: null, createdAt: "", updatedAt: "" }],
    warehouses: [{ id: "w1", name: "Main", code: "MAIN", address: null, state: null, createdAt: "", updatedAt: "" }],
    coupons: [],
    discounts: [],
    now: new Date("2026-06-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("buildDashboardInsights — revenue", () => {
  it("sums gross line amounts minus discounts, only for revenue-eligible statuses", () => {
    const result = buildDashboardInsights(
      baseInput({
        sales: [
          sale({ status: "COMPLETED", items: [{ id: "i1", productId: "p1", quantity: "2", price: "100", tax: "0", taxes: [] }] }),
          sale({ id: "2", status: "DRAFT" }),
          sale({ id: "3", status: "CANCELLED" }),
          sale({
            id: "4",
            status: "CONFIRMED",
            items: [{ id: "i2", productId: "p1", quantity: "1", price: "100", tax: "0", taxes: [] }],
            discounts: [{ id: "d1", saleItemId: "i2", discountId: "1", couponId: null, amount: "10" }],
          }),
        ],
      }),
    );

    // COMPLETED: 2*100=200. CONFIRMED: 100-10=90. DRAFT/CANCELLED excluded.
    expect(result.kpis.totalRevenue).toBe(290);
  });
});

describe("buildDashboardInsights — open sales / pending purchases", () => {
  it("counts sales not yet DELIVERED/COMPLETED/CANCELLED as open", () => {
    const result = buildDashboardInsights(
      baseInput({
        sales: [
          sale({ id: "1", status: "DRAFT" }),
          sale({ id: "2", status: "CONFIRMED" }),
          sale({ id: "3", status: "COMPLETED" }),
          sale({ id: "4", status: "CANCELLED" }),
        ],
      }),
    );
    expect(result.kpis.openSalesCount).toBe(2);
  });

  it("counts DRAFT/ORDERED/PARTIALLY_RECEIVED purchases as pending", () => {
    const result = buildDashboardInsights(
      baseInput({
        purchases: [
          purchase({ id: "1", status: "DRAFT" }),
          purchase({ id: "2", status: "ORDERED" }),
          purchase({ id: "3", status: "PARTIALLY_RECEIVED" }),
          purchase({ id: "4", status: "RECEIVED" }),
          purchase({ id: "5", status: "CANCELLED" }),
        ],
      }),
    );
    expect(result.kpis.pendingPurchasesCount).toBe(3);
  });
});

describe("buildDashboardInsights — low stock", () => {
  it("flags balances at or below the threshold and sorts ascending", () => {
    const result = buildDashboardInsights(
      baseInput({
        balances: [
          { warehouseId: "w1", productId: "p1", quantity: String(LOW_STOCK_THRESHOLD + 1), updatedAt: "" },
          { warehouseId: "w1", productId: "p1", quantity: "3", updatedAt: "" },
          { warehouseId: "w1", productId: "p1", quantity: String(LOW_STOCK_THRESHOLD), updatedAt: "" },
        ],
      }),
    );
    expect(result.kpis.lowStockCount).toBe(2);
    expect(result.lowStockLines.map((l) => l.quantity)).toEqual([3, LOW_STOCK_THRESHOLD]);
  });
});

describe("buildDashboardInsights — active coupons/discounts", () => {
  it("only counts isActive entries within their start/end date window", () => {
    const result = buildDashboardInsights(
      baseInput({
        coupons: [
          { id: "1", code: "A", type: "FLAT", value: "10", scope: "ORDER", warehouseId: null, customerGroupId: null, customerId: null, productIds: [], categoryIds: [], minPurchaseAmount: null, maxDiscountAmount: null, usageLimitTotal: null, usageLimitPerCustomer: null, startDate: "2026-01-01", endDate: null, isActive: true, stackable: false },
          { id: "2", code: "B", type: "FLAT", value: "10", scope: "ORDER", warehouseId: null, customerGroupId: null, customerId: null, productIds: [], categoryIds: [], minPurchaseAmount: null, maxDiscountAmount: null, usageLimitTotal: null, usageLimitPerCustomer: null, startDate: "2026-01-01", endDate: "2026-02-01", isActive: true, stackable: false },
          { id: "3", code: "C", type: "FLAT", value: "10", scope: "ORDER", warehouseId: null, customerGroupId: null, customerId: null, productIds: [], categoryIds: [], minPurchaseAmount: null, maxDiscountAmount: null, usageLimitTotal: null, usageLimitPerCustomer: null, startDate: "2026-01-01", endDate: null, isActive: false, stackable: false },
        ],
      }),
    );
    // Coupon A: active, no end date -> active. B: ended before `now` -> inactive. C: isActive=false -> inactive.
    expect(result.kpis.activeCouponsCount).toBe(1);
  });
});

describe("buildDashboardInsights — breakdowns and top products", () => {
  it("groups sales by status and channel", () => {
    const result = buildDashboardInsights(
      baseInput({
        sales: [
          sale({ id: "1", status: "COMPLETED", channel: "POS" }),
          sale({ id: "2", status: "COMPLETED", channel: "ONLINE" }),
          sale({ id: "3", status: "DRAFT", channel: "POS" }),
        ],
      }),
    );
    expect(result.salesByStatus).toEqual(expect.arrayContaining([{ status: "COMPLETED", count: 2 }, { status: "DRAFT", count: 1 }]));
    expect(result.salesByChannel).toEqual(expect.arrayContaining([{ channel: "POS", count: 2 }, { channel: "ONLINE", count: 1 }]));
  });

  it("ranks top products by gross revenue, capped at 5", () => {
    const result = buildDashboardInsights(
      baseInput({
        products: {
          items: [
            { id: "p1", sku: "S1", barcode: null, name: "Widget", status: "ACTIVE", categoryId: null, brandId: null, unitId: null, taxRateId: null, images: [], createdAt: "", updatedAt: "" },
            { id: "p2", sku: "S2", barcode: null, name: "Gadget", status: "ACTIVE", categoryId: null, brandId: null, unitId: null, taxRateId: null, images: [], createdAt: "", updatedAt: "" },
          ],
          pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
        },
        sales: [
          sale({ id: "1", status: "COMPLETED", items: [{ id: "i1", productId: "p1", quantity: "1", price: "50", tax: "0", taxes: [] }] }),
          sale({ id: "2", status: "COMPLETED", items: [{ id: "i2", productId: "p2", quantity: "1", price: "500", tax: "0", taxes: [] }] }),
        ],
      }),
    );
    expect(result.topProductsByRevenue[0]).toEqual({ productId: "p2", productName: "Gadget", revenue: 500 });
    expect(result.topProductsByRevenue[1]).toEqual({ productId: "p1", productName: "Widget", revenue: 50 });
  });
});

describe("buildDashboardInsights — recent activity", () => {
  it("returns the 5 most recently created sales/purchases, newest first", () => {
    const result = buildDashboardInsights(
      baseInput({
        sales: [
          sale({ id: "1", createdAt: "2026-01-01T00:00:00.000Z" }),
          sale({ id: "2", createdAt: "2026-03-01T00:00:00.000Z" }),
        ],
        purchases: [
          purchase({ id: "1", createdAt: "2026-01-01T00:00:00.000Z" }),
          purchase({ id: "2", createdAt: "2026-03-01T00:00:00.000Z" }),
        ],
      }),
    );
    expect(result.recentSales.map((s) => s.id)).toEqual(["2", "1"]);
    expect(result.recentPurchases.map((p) => p.id)).toEqual(["2", "1"]);
  });
});
