"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const statusChartConfig = { count: { label: "Sales", color: "var(--chart-1)" } } satisfies ChartConfig;
const revenueChartConfig = { revenue: { label: "Revenue", color: "var(--chart-2)" } } satisfies ChartConfig;
const channelChartConfig = {
  POS: { label: "POS", color: "var(--chart-1)" },
  ONLINE: { label: "Online", color: "var(--chart-2)" },
  MARKETPLACE: { label: "Marketplace", color: "var(--chart-3)" },
  PHONE: { label: "Phone", color: "var(--chart-4)" },
} satisfies ChartConfig;

const KPIS: { label: string; value: string; caption?: string }[] = [
  { label: "Revenue", value: "18,42,600", caption: "Excludes tax; confirmed sales onward" },
  { label: "Products", value: "2,960" },
  { label: "Open sales", value: "34", caption: "Not yet delivered/completed" },
  { label: "Pending purchases", value: "9", caption: "Awaiting receipt" },
  { label: "Low stock lines", value: "12", caption: "Quantity at or below 10" },
  { label: "Customers", value: "1,204" },
  { label: "Active discounts", value: "6" },
  { label: "Active coupons", value: "4" },
];

const SALES_BY_STATUS = [
  { status: "DRAFT", count: 4 },
  { status: "CONFIRMED", count: 18 },
  { status: "DELIVERED", count: 52 },
  { status: "COMPLETED", count: 96 },
  { status: "CANCELLED", count: 3 },
];

const SALES_BY_CHANNEL = [
  { channel: "POS", count: 120 },
  { channel: "ONLINE", count: 46 },
  { channel: "MARKETPLACE", count: 18 },
  { channel: "PHONE", count: 9 },
];

const TOP_PRODUCTS_BY_REVENUE = [
  { productName: "Wireless Mouse", revenue: 84200 },
  { productName: "Barcode Scanner", revenue: 71600 },
  { productName: "Thermal Printer", revenue: 58900 },
  { productName: "Cash Drawer", revenue: 42100 },
  { productName: "Receipt Paper Rolls", revenue: 21300 },
];

const RECENT_SALES = [
  { id: "1", customerName: "Downtown Flagship Store", status: "COMPLETED", total: 4850 },
  { id: "2", customerName: "Walk-in Customer", status: "CONFIRMED", total: 1260 },
  { id: "3", customerName: "Westside Retail Branch", status: "DELIVERED", total: 3120 },
];

const RECENT_PURCHASES = [
  { id: "1", supplierName: "Apex Distributors", status: "RECEIVED" },
  { id: "2", supplierName: "Metro Hardware Supply", status: "PENDING" },
  { id: "3", supplierName: "Northgate Traders", status: "PARTIAL" },
];

const LOW_STOCK_LINES = [
  { key: "1", productName: "Wireless Mouse", warehouseName: "Central Logistics Warehouse", quantity: 3 },
  { key: "2", productName: "USB-C Cable 1m", warehouseName: "Downtown Flagship Store", quantity: 5 },
  { key: "3", productName: "Barcode Labels (Roll)", warehouseName: "Westside Retail Branch", quantity: 8 },
];

export function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-5xl rounded-2xl border border-border/80 bg-card/95 p-4 text-left shadow-2xl backdrop-blur-xl sm:p-6 md:p-8">
      {/* Decorative gradient glowing orb behind container */}
      <div className="pointer-events-none absolute -top-12 left-1/2 -z-10 h-64 w-full -translate-x-1/2 rounded-full bg-gradient-to-r from-primary/20 via-indigo-500/10 to-purple-500/20 blur-3xl opacity-70" />

      {/* Top bar — mirrors the real /dashboard header */}
      <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h1 className="font-heading text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Signed in as Priya Sharma (Store Manager)</p>
        </div>
        <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Live
        </Badge>
      </div>

      <div className="mt-6 space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {KPIS.map((kpi) => (
            <Card key={kpi.label}>
              <CardHeader className="pb-2">
                <CardDescription>{kpi.label}</CardDescription>
                <CardTitle className="text-2xl">{kpi.value}</CardTitle>
              </CardHeader>
              {kpi.caption && (
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">{kpi.caption}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Sales by status</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={statusChartConfig} className="h-64 w-full">
                <BarChart data={SALES_BY_STATUS}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="status" tickLine={false} axisLine={false} fontSize={11} interval={0} angle={-30} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sales by channel</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={channelChartConfig} className="mx-auto h-64 aspect-square">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie data={SALES_BY_CHANNEL} dataKey="count" nameKey="channel" innerRadius={45} strokeWidth={2}>
                    {SALES_BY_CHANNEL.map((entry, index) => (
                      <Cell key={entry.channel} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top products by revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={revenueChartConfig} className="h-64 w-full">
                <BarChart data={TOP_PRODUCTS_BY_REVENUE} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis dataKey="productName" type="category" tickLine={false} axisLine={false} width={100} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Tables row */}
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
                  {RECENT_SALES.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.customerName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.status}</Badge>
                      </TableCell>
                      <TableCell>{s.total.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
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
                  {RECENT_PURCHASES.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.supplierName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{p.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
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
                  {LOW_STOCK_LINES.map((line) => (
                    <TableRow key={line.key}>
                      <TableCell>{line.productName}</TableCell>
                      <TableCell>{line.warehouseName}</TableCell>
                      <TableCell>{line.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
