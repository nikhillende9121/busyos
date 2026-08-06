"use client";

import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import { buildDashboardInsights } from "@/lib/insights/compute-insights";
import { computeGstInsights } from "@/lib/insights/compute-gst-insights";
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

const PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const statusChartConfig = { count: { label: "Sales", color: "var(--chart-1)" } } satisfies ChartConfig;
const revenueChartConfig = { revenue: { label: "Revenue", color: "var(--chart-2)" } } satisfies ChartConfig;
const channelChartConfig = {
  POS: { label: "POS", color: "var(--chart-1)" },
  ONLINE: { label: "Online", color: "var(--chart-2)" },
  MARKETPLACE: { label: "Marketplace", color: "var(--chart-3)" },
  PHONE: { label: "Phone", color: "var(--chart-4)" },
} satisfies ChartConfig;

function KpiCard({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {caption && (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">{caption}</p>
        </CardContent>
      )}
    </Card>
  );
}

export default function DashboardHomePage() {
  const { user } = useAuth();

  const salesQuery = useQuery({
    queryKey: queryKeys.list("sales"),
    queryFn: () => apiClient.get<SaleView[]>("/sales"),
  });
  const purchasesQuery = useQuery({
    queryKey: queryKeys.list("purchases"),
    queryFn: () => apiClient.get<PurchaseView[]>("/purchases"),
  });
  const productsQuery = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });
  const balancesQuery = useQuery({
    queryKey: queryKeys.list("inventory-balance"),
    queryFn: () => apiClient.get<InventoryBalanceView[]>("/inventory/balance"),
  });
  const customersQuery = useQuery({
    queryKey: queryKeys.list("customers"),
    queryFn: () => apiClient.get<CustomerView[]>("/customers"),
  });
  const suppliersQuery = useQuery({
    queryKey: queryKeys.list("suppliers"),
    queryFn: () => apiClient.get<SupplierView[]>("/suppliers"),
  });
  const warehousesQuery = useQuery({
    queryKey: queryKeys.list("warehouses"),
    queryFn: () => apiClient.get<WarehouseView[]>("/warehouses"),
  });
  const couponsQuery = useQuery({
    queryKey: queryKeys.list("coupons"),
    queryFn: () => apiClient.get<CouponView[]>("/coupons"),
  });
  const discountsQuery = useQuery({
    queryKey: queryKeys.list("discounts"),
    queryFn: () => apiClient.get<DiscountView[]>("/discounts"),
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold font-heading">Dashboard</h1>
        <p className="text-muted-foreground">
          {user ? `Signed in as ${user.name} (${user.role.name})` : "Welcome"}
        </p>
      </div>

      {isLoading || !insights ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Sales by status</CardTitle>
              </CardHeader>
              <CardContent>
                {insights.salesByStatus.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sales yet.</p>
                ) : (
                  <ChartContainer config={statusChartConfig} className="h-64 w-full">
                    <BarChart data={insights.salesByStatus}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="status" tickLine={false} axisLine={false} fontSize={11} interval={0} angle={-30} textAnchor="end" height={60} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sales by channel</CardTitle>
              </CardHeader>
              <CardContent>
                {insights.salesByChannel.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sales yet.</p>
                ) : (
                  <ChartContainer config={channelChartConfig} className="mx-auto h-64 aspect-square">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <Pie data={insights.salesByChannel} dataKey="count" nameKey="channel" innerRadius={45} strokeWidth={2}>
                        {insights.salesByChannel.map((entry, index) => (
                          <Cell key={entry.channel} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top products by revenue</CardTitle>
              </CardHeader>
              <CardContent>
                {insights.topProductsByRevenue.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sales yet.</p>
                ) : (
                  <ChartContainer config={revenueChartConfig} className="h-64 w-full">
                    <BarChart data={insights.topProductsByRevenue} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis dataKey="productName" type="category" tickLine={false} axisLine={false} width={100} fontSize={11} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
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
