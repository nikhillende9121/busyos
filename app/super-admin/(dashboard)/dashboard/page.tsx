"use client";

import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { superAdminApiClient } from "@/lib/api/super-admin-client";
import type { SuperAdminDashboardView } from "@/modules/super-admin/types/dashboard.types";

const growthChartConfig = { count: { label: "New tenants", color: "var(--chart-1)" } } satisfies ChartConfig;
const planChartConfig = { count: { label: "Active contracts", color: "var(--chart-2)" } } satisfies ChartConfig;
const featureChartConfig = { count: { label: "Tenants enabled", color: "var(--chart-3)" } } satisfies ChartConfig;

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

function monthLabel(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(year, monthNum - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

export default function SuperAdminDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["super-admin", "dashboard"],
    queryFn: () => superAdminApiClient.get<SuperAdminDashboardView>("/dashboard"),
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const statusCaption = data.tenantsByStatus.map((s) => `${s.status[0]}${s.status.slice(1).toLowerCase()} ${s.count}`).join(" · ");
  const growthData = data.tenantGrowth.map((m) => ({ ...m, label: monthLabel(m.month) }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold font-heading">Dashboard</h1>
        <p className="text-muted-foreground">Platform-wide tenant, contract, and adoption overview.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total tenants" value={String(data.totalTenants)} caption={statusCaption || undefined} />
        <KpiCard
          label="Active contracts"
          value={String(data.activeContracts)}
          caption={`${data.newTenantsLast30Days} new tenant${data.newTenantsLast30Days === 1 ? "" : "s"} in the last 30 days`}
        />
        <KpiCard
          label="MRR (est.)"
          value={`₹${Number(data.mrrEstimate).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          caption="Yearly contracts normalized to monthly — an estimate, not a billed figure"
        />
        <KpiCard
          label="Expiring ≤30 days"
          value={String(data.expiringWithin30Days)}
          caption="Active contracts nearing their end date"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tenant growth</CardTitle>
            <CardDescription>New tenants per month, last 12 months.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={growthChartConfig} className="h-64 w-full">
              <BarChart data={growthData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan distribution</CardTitle>
            <CardDescription>Active contracts per plan.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.planDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active contracts.</p>
            ) : (
              <ChartContainer config={planChartConfig} className="h-64 w-full">
                <BarChart data={data.planDistribution}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="planName"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Feature adoption</CardTitle>
          <CardDescription>How many tenants currently have each feature enabled.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.featureAdoption.length === 0 ? (
            <p className="text-sm text-muted-foreground">No features in the catalog yet.</p>
          ) : (
            <ChartContainer config={featureChartConfig} className="h-[440px] w-full">
              <BarChart data={data.featureAdoption} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={140} fontSize={11} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contracts expiring soonest</CardTitle>
          <CardDescription>Across every tenant, active contracts only.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>End date</TableHead>
                <TableHead>Days remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.expiringSoonest.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No active contracts.
                  </TableCell>
                </TableRow>
              ) : (
                data.expiringSoonest.map((contract) => (
                  <TableRow key={contract.tenantId}>
                    <TableCell>{contract.tenantName}</TableCell>
                    <TableCell>{contract.planName}</TableCell>
                    <TableCell>{new Date(contract.endDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {contract.daysRemaining <= 14 ? (
                        <Badge variant="destructive">{contract.daysRemaining}d</Badge>
                      ) : (
                        `${contract.daysRemaining}d`
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
