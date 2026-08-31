import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/modules/sales/service/sale.service", () => ({
  saleService: { exportList: vi.fn() },
}));

vi.mock("@/modules/purchase/service/purchase.service", () => ({
  purchaseService: { exportList: vi.fn() },
}));

vi.mock("@/modules/tax-rate/service/tax-rate.service", () => ({
  taxRateService: { list: vi.fn() },
}));

vi.mock("@/lib/insights/compute-gst-insights", () => ({
  computeGstInsights: vi.fn(),
}));

import { saleService } from "@/modules/sales/service/sale.service";
import { purchaseService } from "@/modules/purchase/service/purchase.service";
import { taxRateService } from "@/modules/tax-rate/service/tax-rate.service";
import { computeGstInsights } from "@/lib/insights/compute-gst-insights";
import { reportService } from "../service/report.service";

describe("reportService.getGstReport", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches the complete sales/purchases/tax-rates for the period and delegates to computeGstInsights", async () => {
    const periodStart = new Date("2026-08-01T00:00:00.000Z");
    const periodEnd = new Date("2026-08-31T23:59:59.999Z");
    const sales = [{ id: "1" }] as never;
    const purchases = [{ id: "2" }] as never;
    const taxRates = [{ id: "3" }] as never;
    const insights = { outputTax: 100 } as never;

    vi.mocked(saleService.exportList).mockResolvedValue(sales);
    vi.mocked(purchaseService.exportList).mockResolvedValue(purchases);
    vi.mocked(taxRateService.list).mockResolvedValue(taxRates);
    vi.mocked(computeGstInsights).mockReturnValue(insights);

    const result = await reportService.getGstReport({ tenantId: 1n, periodStart, periodEnd });

    expect(saleService.exportList).toHaveBeenCalledWith({ tenantId: 1n, dateFrom: periodStart, dateTo: periodEnd });
    expect(purchaseService.exportList).toHaveBeenCalledWith({
      tenantId: 1n,
      dateFrom: periodStart,
      dateTo: periodEnd,
    });
    expect(taxRateService.list).toHaveBeenCalledWith(1n);
    expect(computeGstInsights).toHaveBeenCalledWith({ sales, purchases, taxRates, periodStart, periodEnd });
    expect(result).toBe(insights);
  });
});
