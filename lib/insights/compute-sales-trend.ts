import type { SaleView } from "@/modules/sales/types/sale.types";
import { REVENUE_SALE_STATUSES, saleNetAmount } from "./compute-insights";

// Pure aggregation over data the dashboard already fetches (the full sales
// list, via fetchAllPages) — no new backend endpoint, same "compute over
// already-fetched data" philosophy as compute-insights.ts and
// compute-gst-insights.ts. Revenue is defined identically to
// DashboardInsights.kpis.totalRevenue (net of discounts, only sales whose
// stock has actually left and hasn't been reversed) — see
// REVENUE_SALE_STATUSES/saleNetAmount's own comments in compute-insights.ts.

export type SalesTrendPoint = {
  /** Raw period key — "YYYY-MM-DD" (daily), "YYYY-MM" (monthly), or "YYYY" (yearly). Formatted for display by the caller. */
  label: string;
  revenue: number;
};

export type SalesTrend = {
  /** Last 30 days, oldest first, zero-filled for days with no revenue. */
  daily: SalesTrendPoint[];
  /** Last 12 months, oldest first, zero-filled. */
  monthly: SalesTrendPoint[];
  /** Last 5 years (including the current year), oldest first, zero-filled. */
  yearly: SalesTrendPoint[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_WINDOW_DAYS = 30;
const MONTHLY_WINDOW_MONTHS = 12;
const YEARLY_WINDOW_YEARS = 5;

function dailyKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthlyKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function yearlyKey(date: Date): string {
  return String(date.getFullYear());
}

export function computeSalesTrend(sales: SaleView[], now: Date = new Date()): SalesTrend {
  const revenueSales = sales.filter((sale) => REVENUE_SALE_STATUSES.has(sale.status));

  const dailyTotals = new Map<string, number>();
  const monthlyTotals = new Map<string, number>();
  const yearlyTotals = new Map<string, number>();
  for (const sale of revenueSales) {
    // saleDate, not createdAt — a trend chart tracks when the sale
    // happened, matching the same field the KPI cards' own date filters
    // (e.g. dateRangeQueryFields) use everywhere else in this app.
    const date = new Date(sale.saleDate);
    const amount = saleNetAmount(sale);
    const dKey = dailyKey(date);
    const mKey = monthlyKey(date);
    const yKey = yearlyKey(date);
    dailyTotals.set(dKey, (dailyTotals.get(dKey) ?? 0) + amount);
    monthlyTotals.set(mKey, (monthlyTotals.get(mKey) ?? 0) + amount);
    yearlyTotals.set(yKey, (yearlyTotals.get(yKey) ?? 0) + amount);
  }

  const daily: SalesTrendPoint[] = [];
  for (let i = DAILY_WINDOW_DAYS - 1; i >= 0; i--) {
    const key = dailyKey(new Date(now.getTime() - i * DAY_MS));
    daily.push({ label: key, revenue: dailyTotals.get(key) ?? 0 });
  }

  const monthly: SalesTrendPoint[] = [];
  for (let i = MONTHLY_WINDOW_MONTHS - 1; i >= 0; i--) {
    const key = monthlyKey(new Date(now.getFullYear(), now.getMonth() - i, 1));
    monthly.push({ label: key, revenue: monthlyTotals.get(key) ?? 0 });
  }

  const yearly: SalesTrendPoint[] = [];
  for (let i = YEARLY_WINDOW_YEARS - 1; i >= 0; i--) {
    const key = String(now.getFullYear() - i);
    yearly.push({ label: key, revenue: yearlyTotals.get(key) ?? 0 });
  }

  return { daily, monthly, yearly };
}
