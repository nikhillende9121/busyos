import { saleService } from "@/modules/sales/service/sale.service";
import { purchaseService } from "@/modules/purchase/service/purchase.service";
import { taxRateService } from "@/modules/tax-rate/service/tax-rate.service";
import { computeGstInsights, type GstInsights } from "@/lib/insights/compute-gst-insights";
import type { GstReportDto } from "../dto/report.dto";

export const reportService = {
  // Server-side twin of what app/(dashboard)/reports/gst/page.tsx used to
  // compute client-side: the same computeGstInsights() over the same
  // complete (unpaginated) sales/purchases for the period — reusing
  // saleService/purchaseService's existing exportList() (already fetches
  // every matching row, no page/pageSize, for GET /sales|/purchases/export)
  // rather than looping the paginated list() or duplicating a repository
  // query. Tenant-wide by design — no warehouse scoping — a GST filing
  // figure covers the whole tenant, not one store.
  async getGstReport(dto: GstReportDto): Promise<GstInsights> {
    const [sales, purchases, taxRates] = await Promise.all([
      saleService.exportList({ tenantId: dto.tenantId, dateFrom: dto.periodStart, dateTo: dto.periodEnd }),
      purchaseService.exportList({ tenantId: dto.tenantId, dateFrom: dto.periodStart, dateTo: dto.periodEnd }),
      taxRateService.list(dto.tenantId),
    ]);
    return computeGstInsights({ sales, purchases, taxRates, periodStart: dto.periodStart, periodEnd: dto.periodEnd });
  },
};
