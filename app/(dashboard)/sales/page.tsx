"use client";

import { useState } from "react";
import { useForm, Controller, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoaderButton } from "@/components/ui/loader-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { LineItemsField } from "@/components/resource/line-items-field";
import { DateRangeFilter, type DateRange } from "@/components/resource/date-range-filter";
import { ExportButton } from "@/components/resource/export-button";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import { createSaleSchema } from "@/modules/sales/schema/sale.schema";
import type { SaleView } from "@/modules/sales/types/sale.types";
import type { CustomerView } from "@/modules/customer/types/customer.types";
import type { WarehouseView } from "@/modules/warehouse/types/warehouse.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { ExtraChargeView } from "@/modules/extra-charge/types/extra-charge.types";
import type { Paginated } from "@/shared/utils/pagination";

const CHANNEL_OPTIONS = [
  { label: "POS", value: "POS" },
  { label: "Online", value: "ONLINE" },
  { label: "Marketplace", value: "MARKETPLACE" },
  { label: "Phone", value: "PHONE" },
];

type Row = SaleView & { customerName: string; warehouseName: string };

export default function SalesPage() {
  const queryClient = useQueryClient();
  const { can, hasFeature } = useAuth();
  const isCustomerFeatureEnabled = hasFeature("CUSTOMER");
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<DateRange>({});

  const { data: salesPage, isLoading } = useQuery({
    queryKey: queryKeys.list("sales", { page, ...dateRange }),
    queryFn: () =>
      apiClient.get<Paginated<SaleView>>("/sales", { page, pageSize: 20, ...dateRange }),
  });
  const sales = salesPage?.items;
  const { data: customersPage } = useQuery({
    queryKey: queryKeys.list("customers", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<CustomerView>>("/customers", { page: 1, pageSize: 100 }),
    enabled: isCustomerFeatureEnabled,
  });
  const customers = customersPage?.items;
  const { data: warehouses } = useQuery({
    queryKey: queryKeys.list("warehouses"),
    queryFn: () => apiClient.get<WarehouseView[]>("/warehouses"),
  });
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });
  const { data: extraCharges } = useQuery({
    queryKey: queryKeys.list("extra-charges"),
    queryFn: () => apiClient.get<ExtraChargeView[]>("/extra-charges"),
  });

  const customerName = (id: string | null) => (id ? (customers?.find((c) => c.id === id)?.name ?? id) : "—");
  const warehouseName = (id: string) => warehouses?.find((w) => w.id === id)?.name ?? id;
  const productOptions = (products?.items ?? []).map((p) => ({ label: `${p.sku} — ${p.name}`, value: p.id }));

  const columns: DataTableColumn<Row>[] = [
    {
      key: "id",
      header: "ID",
      render: (row) => (
        <Link href={`/sales/${row.id}`} className="underline underline-offset-2">
          #{row.id}
        </Link>
      ),
    },
    { key: "customerName", header: "Customer" },
    { key: "channel", header: "Channel", render: (row) => <Badge variant="outline">{row.channel}</Badge> },
    { key: "status", header: "Status", render: (row) => <Badge>{row.status}</Badge> },
    { key: "saleDate", header: "Date", render: (row) => new Date(row.saleDate).toLocaleDateString() },
  ];

  const rows: Row[] = (sales ?? []).map((s) => ({
    ...s,
    customerName: customerName(s.customerId),
    warehouseName: warehouseName(s.warehouseId),
  }));

  const defaultFormValues = {
    customerId: "",
    warehouseId: "",
    channel: "POS",
    saleDate: new Date().toISOString().slice(0, 10),
    couponCode: "",
    extraChargeIds: [] as string[],
    items: [{ productId: "", quantity: "" }],
  };

  const form = useForm<FieldValues>({
    resolver: zodResolver(createSaleSchema as never),
    defaultValues: defaultFormValues,
  });

  const createMutation = useMutation({
    mutationFn: (values: FieldValues) => apiClient.post<SaleView>("/sales", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.list("sales") });
      toast.success("Sale created");
      setCreateOpen(false);
      form.reset(defaultFormValues);
    },
  });

  const onSubmit = async (values: FieldValues) => {
    if (isCustomerFeatureEnabled && !values.customerId) {
      form.setError("customerId", { type: "manual", message: "Customer is required when customer feature is enabled in your plan" });
      return;
    }
    try {
      const payload = {
        ...values,
        customerId: values.customerId || undefined,
        couponCode: values.couponCode || undefined,
      };
      await createMutation.mutateAsync(payload);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Sales</h1>
          <p className="text-muted-foreground">Sales orders across every channel.</p>
        </div>
        {can("SALE.CREATE") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New sale
          </Button>
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        <DateRangeFilter
          value={dateRange}
          onChange={(next) => {
            setDateRange(next);
            setPage(1);
          }}
        />
        <ExportButton resource="sales" params={dateRange} />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        emptyMessage="No sales yet."
        pagination={salesPage?.pagination}
        onPageChange={setPage}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New sale</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Customer {isCustomerFeatureEnabled ? "" : "(optional)"}</Label>
                <Controller
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={isCustomerFeatureEnabled ? "Select customer" : "Select customer (optional)"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(customers ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.customerId && (
                  <p className="text-xs text-destructive">{String(form.formState.errors.customerId.message)}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Warehouse</Label>
                <Controller
                  control={form.control}
                  name="warehouseId"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select warehouse" />
                      </SelectTrigger>
                      <SelectContent>
                        {(warehouses ?? []).map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Channel</Label>
                <Controller
                  control={form.control}
                  name="channel"
                  render={({ field }) => (
                    <Select value={field.value ?? "POS"} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHANNEL_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="saleDate">Sale date</Label>
                <Input id="saleDate" type="date" {...form.register("saleDate")} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="couponCode">Coupon code (optional)</Label>
              <Input id="couponCode" placeholder="WELCOME20" {...form.register("couponCode")} />
            </div>

            <LineItemsField
              control={form.control}
              name="items"
              productOptions={productOptions}
              columns={[{ name: "quantity", label: "Quantity" }]}
              emptyItem={{ productId: "", quantity: "" }}
            />
            <p className="text-xs text-muted-foreground">
              Price is resolved automatically from this store&apos;s price-list configuration.
            </p>

            {(() => {
              const watchedChannel = form.watch("channel") ?? "POS";
              const applicableExtraCharges = (extraCharges ?? []).filter(
                (charge) =>
                  !charge.applicableChannels ||
                  charge.applicableChannels.length === 0 ||
                  charge.applicableChannels.includes(watchedChannel),
              );
              if (applicableExtraCharges.length === 0) return null;
              return (
                <div className="space-y-1.5">
                  <Label>Extra charges</Label>
                  <Controller
                    control={form.control}
                    name="extraChargeIds"
                    render={({ field }) => (
                      <div className="grid grid-cols-2 gap-1.5 rounded-md border p-3">
                        {applicableExtraCharges.map((charge) => {
                          const selected: string[] = field.value ?? [];
                          return (
                            <label key={charge.id} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={selected.includes(charge.id)}
                                onCheckedChange={(checked) => {
                                  field.onChange(
                                    checked
                                      ? [...selected, charge.id]
                                      : selected.filter((id) => id !== charge.id),
                                  );
                                }}
                              />
                              {charge.name} ({charge.calcType === "FLAT" ? charge.value : `${charge.value}%`})
                            </label>
                          );
                        })}
                      </div>
                    )}
                  />
                </div>
              );
            })()}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <LoaderButton type="submit" loading={form.formState.isSubmitting}>
                Create sale
              </LoaderButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
