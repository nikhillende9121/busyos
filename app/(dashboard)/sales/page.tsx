"use client";

import { useState } from "react";
import { useForm, Controller, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { LineItemsField } from "@/components/resource/line-items-field";
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
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: sales, isLoading } = useQuery({
    queryKey: queryKeys.list("sales"),
    queryFn: () => apiClient.get<SaleView[]>("/sales"),
  });
  const { data: customers } = useQuery({
    queryKey: queryKeys.list("customers"),
    queryFn: () => apiClient.get<CustomerView[]>("/customers"),
  });
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

  const customerName = (id: string) => customers?.find((c) => c.id === id)?.name ?? id;
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
    try {
      const payload = { ...values, couponCode: values.couponCode || undefined };
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

      <DataTable columns={columns} rows={rows} isLoading={isLoading} getRowId={(row) => row.id} emptyMessage="No sales yet." />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New sale</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <Controller
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select customer" />
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

            {(extraCharges ?? []).length > 0 && (
              <div className="space-y-1.5">
                <Label>Extra charges</Label>
                <Controller
                  control={form.control}
                  name="extraChargeIds"
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-1.5 rounded-md border p-3">
                      {(extraCharges ?? []).map((charge) => {
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
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating…" : "Create sale"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
