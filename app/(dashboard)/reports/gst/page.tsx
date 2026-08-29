"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { apiClient } from "@/lib/api/client";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import { queryKeys } from "@/lib/api/query-keys";
import { computeGstInsights } from "@/lib/insights/compute-gst-insights";
import type { SaleView } from "@/modules/sales/types/sale.types";
import type { PurchaseView } from "@/modules/purchase/types/purchase.types";
import type { TaxRateView } from "@/modules/tax-rate/types/tax-rate.types";
import type { Paginated } from "@/shared/utils/pagination";

const componentChartConfig = {
  amount: { label: "Tax collected", color: "var(--chart-1)" },
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

function firstOfMonth(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

function today(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const money = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function GstReportPage() {
  const now = new Date();
  const [from, setFrom] = useState(firstOfMonth(now));
  const [to, setTo] = useState(today(now));

  // GST totals must be computed over the complete set, not one capped
  // page — this fetches every page rather than treating /sales|/purchases
  // as a picker.
  const salesQuery = useQuery({
    queryKey: queryKeys.list("sales", { all: true }),
    queryFn: () => fetchAllPages((page) => apiClient.get<Paginated<SaleView>>("/sales", { page, pageSize: 100 })),
  });
  const purchasesQuery = useQuery({
    queryKey: queryKeys.list("purchases", { all: true }),
    queryFn: () =>
      fetchAllPages((page) => apiClient.get<Paginated<PurchaseView>>("/purchases", { page, pageSize: 100 })),
  });
  const taxRatesQuery = useQuery({
    queryKey: queryKeys.list("tax-rates"),
    queryFn: () => apiClient.get<TaxRateView[]>("/tax-rates"),
  });

  const isLoading = salesQuery.isLoading || purchasesQuery.isLoading || taxRatesQuery.isLoading;

  const periodStart = new Date(`${from}T00:00:00.000Z`);
  const periodEnd = new Date(`${to}T23:59:59.999Z`);

  const insights = !isLoading
    ? computeGstInsights({
        sales: salesQuery.data ?? [],
        purchases: purchasesQuery.data ?? [],
        taxRates: taxRatesQuery.data ?? [],
        periodStart,
        periodEnd,
      })
    : null;

  const componentData = insights
    ? [
        { component: "CGST", amount: insights.outputByComponent.cgst },
        { component: "SGST", amount: insights.outputByComponent.sgst },
        { component: "IGST", amount: insights.outputByComponent.igst },
        ...(insights.outputByComponent.cess > 0 ? [{ component: "CESS", amount: insights.outputByComponent.cess }] : []),
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold font-heading">GST report</h1>
        <p className="text-muted-foreground">
          Output tax (sales) vs input tax (purchases) vs net payable, and an HSN/rate-wise summary for GSTR-1.
        </p>
      </div>

      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
      </div>

      {isLoading || !insights ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <KpiCard label="Output tax" value={money(insights.outputTax)} caption="Collected on sales in this period" />
            <KpiCard label="Input tax" value={money(insights.inputTax)} caption="Paid on purchases in this period (ITC)" />
            <KpiCard
              label="Net payable"
              value={money(insights.netPayable)}
              caption={insights.netPayable < 0 ? "Net input credit carried forward" : "Output minus input tax"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Output tax by component</CardTitle>
            </CardHeader>
            <CardContent>
              {componentData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales in this period.</p>
              ) : (
                <ChartContainer config={componentChartConfig} className="h-64 w-full">
                  <BarChart data={componentData}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="component" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="amount" fill="var(--color-amount)" radius={4} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>HSN/rate-wise summary</CardTitle>
              <CardDescription>Output tax only — the section GSTR-1&apos;s HSN summary needs.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tax rate</TableHead>
                    <TableHead>HSN/SAC</TableHead>
                    <TableHead>Taxable value</TableHead>
                    <TableHead>CGST</TableHead>
                    <TableHead>SGST</TableHead>
                    <TableHead>IGST</TableHead>
                    <TableHead>CESS</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insights.rateBreakdown.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No sales in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    insights.rateBreakdown.map((row) => (
                      <TableRow key={row.taxRateId}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.hsnCode ?? row.sacCode ?? "—"}</TableCell>
                        <TableCell>{money(row.taxableValue)}</TableCell>
                        <TableCell>{money(row.cgst)}</TableCell>
                        <TableCell>{money(row.sgst)}</TableCell>
                        <TableCell>{money(row.igst)}</TableCell>
                        <TableCell>{money(row.cess)}</TableCell>
                        <TableCell>{money(row.total)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
