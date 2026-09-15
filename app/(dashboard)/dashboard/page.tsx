"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label as RechartsLabel,
  LabelList,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { apiClient } from "@/lib/api/client";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import { buildDashboardInsights } from "@/lib/insights/compute-insights";
import { computeGstInsights } from "@/lib/insights/compute-gst-insights";
import { computeSalesTrend, type SalesTrend } from "@/lib/insights/compute-sales-trend";
import type { SaleView } from "@/modules/sales/types/sale.types";
import type { PurchaseView } from "@/modules/purchase/types/purchase.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { InventoryBalanceView } from "@/modules/inventory/types/inventory.types";
import type { CustomerView } from "@/modules/customer/types/customer.types";
import type { SupplierView } from "@/modules/supplier/types/supplier.types";
import type { WarehouseView } from "@/modules/warehouse/types/warehouse.types";
import type { CouponView } from "@/modules/pricing/types/coupon.types";
import type { DiscountView } from "@/modules/pricing/types/discount.types";
import type { TaxRateView } from "@/modules/tax-rate/types/tax-rate.types";
import type { Paginated } from "@/shared/utils/pagination";

const statusChartConfig = { count: { label: "Sales", color: "var(--chart-1)" } } satisfies ChartConfig;
const revenueChartConfig = { revenue: { label: "Revenue", color: "var(--chart-2)" } } satisfies ChartConfig;
const channelChartConfig = {
  POS: { label: "POS", color: "var(--chart-1)" },
  ONLINE: { label: "Online", color: "var(--chart-2)" },
  MARKETPLACE: { label: "Marketplace", color: "var(--chart-3)" },
  PHONE: { label: "Phone", color: "var(--chart-4)" },
} satisfies ChartConfig;

type TrendPeriod = keyof SalesTrend;

// Raw period keys ("YYYY-MM-DD" / "YYYY-MM" / "YYYY", see
// compute-sales-trend.ts) formatted for display — kept out of the pure
// insight function itself so it stays free of locale/formatting concerns,
// same split as super-admin's own monthLabel() for its Tenant growth chart.
function formatTrendLabel(label: string, period: TrendPeriod): string {
  if (period === "yearly") return label;
  if (period === "monthly") {
    const [year, month] = label.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }
  const [year, month, day] = label.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const TREND_PERIOD_CAPTION: Record<TrendPeriod, string> = {
  daily: "the last 30 days",
  monthly: "the last 12 months",
  yearly: "the last 5 years",
};

// First-point-vs-last-point of the visible window — the same "trending up
// /down by X%" footer shadcn's own chart examples show, computed from
// whatever period is currently selected rather than a fixed comparison.
function computeTrend(points: { revenue: number }[]): { percent: number; direction: "up" | "down" | "flat" } {
  if (points.length < 2) return { percent: 0, direction: "flat" };
  const first = points[0].revenue;
  const last = points[points.length - 1].revenue;
  if (first === 0) {
    if (last === 0) return { percent: 0, direction: "flat" };
    return { percent: 100, direction: "up" };
  }
  const percent = ((last - first) / first) * 100;
  if (percent === 0) return { percent: 0, direction: "flat" };
  return { percent: Math.abs(percent), direction: percent > 0 ? "up" : "down" };
}

function KpiCard({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <Card>
      <CardHeader className="gap-1.5">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
        {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
      </CardHeader>
    </Card>
  );
}

export default function DashboardHomePage() {
  const { user } = useAuth();
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("daily");

  // Insights aggregate over the complete set (revenue totals, GST) — a
  // single capped page would silently understate them, so this fetches
  // every page rather than treating /sales|/purchases as a picker.
  const salesQuery = useQuery({
    queryKey: queryKeys.list("sales", { all: true }),
    queryFn: () => fetchAllPages((page) => apiClient.get<Paginated<SaleView>>("/sales", { page, pageSize: 100 })),
  });
  const purchasesQuery = useQuery({
    queryKey: queryKeys.list("purchases", { all: true }),
    queryFn: () =>
      fetchAllPages((page) => apiClient.get<Paginated<PurchaseView>>("/purchases", { page, pageSize: 100 })),
  });
  const productsQuery = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });
  // lowStockLines scans the complete set for low-stock rows — a single
  // capped page could silently miss a low-stock alert.
  const balancesQuery = useQuery({
    queryKey: queryKeys.list("inventory-balance", { all: true }),
    queryFn: () =>
      fetchAllPages((page) =>
        apiClient.get<Paginated<InventoryBalanceView>>("/inventory/balance", { page, pageSize: 100 }),
      ),
  });
  // totalCustomers is a KPI count over the complete set — a single capped
  // page would silently understate it.
  const customersQuery = useQuery({
    queryKey: queryKeys.list("customers", { all: true }),
    queryFn: () =>
      fetchAllPages((page) => apiClient.get<Paginated<CustomerView>>("/customers", { page, pageSize: 100 })),
  });
  const suppliersQuery = useQuery({
    queryKey: queryKeys.list("suppliers"),
    queryFn: () => apiClient.get<SupplierView[]>("/suppliers"),
  });
  const warehousesQuery = useQuery({
    queryKey: queryKeys.list("warehouses"),
    queryFn: () => apiClient.get<WarehouseView[]>("/warehouses"),
  });
  // activeCouponsCount is a KPI count over the complete set — a single
  // capped page would silently understate it.
  const couponsQuery = useQuery({
    queryKey: queryKeys.list("coupons", { all: true }),
    queryFn: () => fetchAllPages((page) => apiClient.get<Paginated<CouponView>>("/coupons", { page, pageSize: 100 })),
  });
  // activeDiscountsCount is a KPI count over the complete set — a single
  // capped page would silently understate it.
  const discountsQuery = useQuery({
    queryKey: queryKeys.list("discounts", { all: true }),
    queryFn: () =>
      fetchAllPages((page) => apiClient.get<Paginated<DiscountView>>("/discounts", { page, pageSize: 100 })),
  });
  const taxRatesQuery = useQuery({
    queryKey: queryKeys.list("tax-rates"),
    queryFn: () => apiClient.get<TaxRateView[]>("/tax-rates"),
  });

  const queries = [
    salesQuery,
    purchasesQuery,
    productsQuery,
    balancesQuery,
    customersQuery,
    suppliersQuery,
    warehousesQuery,
    couponsQuery,
    discountsQuery,
    taxRatesQuery,
  ];
  const isLoading = queries.some((q) => q.isLoading);
  const hasError = queries.some((q) => q.isError);

  const insights =
    !isLoading && !hasError
      ? buildDashboardInsights({
          sales: salesQuery.data ?? [],
          purchases: purchasesQuery.data ?? [],
          products: productsQuery.data ?? { items: [], pagination: { page: 1, pageSize: 0, total: 0, totalPages: 0 } },
          balances: balancesQuery.data ?? [],
          customers: customersQuery.data ?? [],
          suppliers: suppliersQuery.data ?? [],
          warehouses: warehousesQuery.data ?? [],
          coupons: couponsQuery.data ?? [],
          discounts: discountsQuery.data ?? [],
        })
      : null;

  const now = new Date();
  const gstInsights =
    !isLoading && !hasError
      ? computeGstInsights({
          sales: salesQuery.data ?? [],
          purchases: purchasesQuery.data ?? [],
          taxRates: taxRatesQuery.data ?? [],
          periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
          periodEnd: now,
        })
      : null;
  const salesTrend = !isLoading && !hasError ? computeSalesTrend(salesQuery.data ?? []) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold font-heading">Dashboard</h1>
        <p className="text-muted-foreground">
          {user ? `Signed in as ${user.name} (${user.role.name})` : "Welcome"}
        </p>
      </div>

      {isLoading || !insights ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {Array.from({ length: 9 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            <KpiCard label="Revenue" value={insights.kpis.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })} caption="Excludes tax; confirmed sales onward" />
            <KpiCard label="Products" value={String(insights.kpis.totalProducts)} />
            <KpiCard label="Open sales" value={String(insights.kpis.openSalesCount)} caption="Not yet delivered/completed" />
            <KpiCard label="Pending purchases" value={String(insights.kpis.pendingPurchasesCount)} caption="Awaiting receipt" />
            <KpiCard label="Low stock lines" value={String(insights.kpis.lowStockCount)} caption="Quantity at or below 10" />
            <KpiCard label="Customers" value={String(insights.kpis.totalCustomers)} />
            <KpiCard label="Active discounts" value={String(insights.kpis.activeDiscountsCount)} />
            <KpiCard label="Active coupons" value={String(insights.kpis.activeCouponsCount)} />
            {gstInsights && (
              <KpiCard
                label="Net GST payable"
                value={gstInsights.netPayable.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                caption="This month — output minus input tax"
              />
            )}
          </div>

          {salesTrend && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                <div>
                  <CardTitle>Sales Trend</CardTitle>
                  <CardDescription>Revenue over time — excludes tax; confirmed sales onward.</CardDescription>
                </div>
                <Tabs value={trendPeriod} onValueChange={(value) => value && setTrendPeriod(value as TrendPeriod)}>
                  <TabsList>
                    <TabsTrigger value="daily">Daily</TabsTrigger>
                    <TabsTrigger value="monthly">Monthly</TabsTrigger>
                    <TabsTrigger value="yearly">Yearly</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent>
                <ChartContainer config={revenueChartConfig} className="h-72 w-full">
                  <AreaChart data={salesTrend[trendPeriod]} margin={{ left: 12, right: 12 }}>
                    <defs>
                      <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      tickFormatter={(value) => formatTrendLabel(value, trendPeriod)}
                      interval={trendPeriod === "daily" ? 4 : 0}
                    />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          indicator="dot"
                          labelFormatter={(value) => formatTrendLabel(String(value), trendPeriod)}
                        />
                      }
                    />
                    <Area
                      dataKey="revenue"
                      type="natural"
                      fill="url(#fillRevenue)"
                      stroke="var(--color-revenue)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
              <CardFooter className="flex-col items-start gap-1.5 text-sm">
                {(() => {
                  const trend = computeTrend(salesTrend[trendPeriod]);
                  if (trend.direction === "flat") {
                    return <p className="text-muted-foreground">Flat over {TREND_PERIOD_CAPTION[trendPeriod]}</p>;
                  }
                  const Icon = trend.direction === "up" ? TrendingUp : TrendingDown;
                  return (
                    <div className="flex items-center gap-2 font-medium leading-none">
                      Trending {trend.direction} by {trend.percent.toFixed(1)}% <Icon className="size-4" />
                    </div>
                  );
                })()}
                <p className="leading-none text-muted-foreground">
                  Showing revenue for {TREND_PERIOD_CAPTION[trendPeriod]}
                </p>
              </CardFooter>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Sales by status</CardTitle>
                <CardDescription>Every sale on record, grouped by its current status.</CardDescription>
              </CardHeader>
              <CardContent>
                {insights.salesByStatus.every((s) => s.count === 0) ? (
                  <p className="text-sm text-muted-foreground">No sales yet.</p>
                ) : (
                  <ChartContainer config={statusChartConfig} className="h-64 w-full">
                    <BarChart data={insights.salesByStatus} margin={{ top: 20 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="status" tickLine={false} axisLine={false} fontSize={11} interval={0} angle={-30} textAnchor="end" height={60} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={8}>
                        <LabelList position="top" offset={8} className="fill-foreground" fontSize={11} />
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle>Sales by channel</CardTitle>
                <CardDescription>Where every sale on record came from.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                {insights.salesByChannel.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sales yet.</p>
                ) : (
                  <ChartContainer config={channelChartConfig} className="mx-auto h-64 aspect-square">
                    <PieChart>
                      <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                      <Pie
                        data={insights.salesByChannel}
                        dataKey="count"
                        nameKey="channel"
                        innerRadius={60}
                        strokeWidth={4}
                      >
                        {insights.salesByChannel.map((entry) => (
                          <Cell key={entry.channel} fill={`var(--color-${entry.channel})`} />
                        ))}
                        <RechartsLabel
                          content={({ viewBox }) => {
                            if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                            const total = insights.salesByChannel.reduce((sum, c) => sum + c.count, 0);
                            return (
                              <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                                <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-3xl font-bold">
                                  {total.toLocaleString()}
                                </tspan>
                                <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 24} className="fill-muted-foreground">
                                  Sales
                                </tspan>
                              </text>
                            );
                          }}
                        />
                      </Pie>
                      <ChartLegend content={<ChartLegendContent nameKey="channel" />} />
                    </PieChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top products by revenue</CardTitle>
                <CardDescription>Best-selling products, gross of discounts.</CardDescription>
              </CardHeader>
              <CardContent>
                {insights.topProductsByRevenue.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sales yet.</p>
                ) : (
                  <ChartContainer config={revenueChartConfig} className="h-64 w-full">
                    <BarChart data={insights.topProductsByRevenue} layout="vertical" margin={{ left: 8, right: 32 }}>
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} hide />
                      <YAxis dataKey="productName" type="category" tickLine={false} axisLine={false} width={100} fontSize={11} />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                      <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4}>
                        <LabelList
                          dataKey="revenue"
                          position="right"
                          offset={8}
                          className="fill-foreground"
                          fontSize={11}
                          formatter={(value) => Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        />
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Recent sales</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {insights.recentSales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          No sales yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      insights.recentSales.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>{s.customerName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{s.status}</Badge>
                          </TableCell>
                          <TableCell>{s.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent purchases</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {insights.recentPurchases.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground">
                          No purchases yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      insights.recentPurchases.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.supplierName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{p.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Low stock</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead>Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {insights.lowStockLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          Nothing below threshold.
                        </TableCell>
                      </TableRow>
                    ) : (
                      insights.lowStockLines.slice(0, 5).map((line) => (
                        <TableRow key={`${line.warehouseId}-${line.productId}`}>
                          <TableCell>{line.productName}</TableCell>
                          <TableCell>{line.warehouseName}</TableCell>
                          <TableCell>{line.quantity}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
