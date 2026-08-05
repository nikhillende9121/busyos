"use client";

import { useState } from "react";
import { useForm, Controller, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { LineItemsField } from "@/components/resource/line-items-field";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import { createPriceListSchema } from "@/modules/pricing/schema/price-list.schema";
import type { PriceListView } from "@/modules/pricing/types/price-list.types";
import type { WarehouseView } from "@/modules/warehouse/types/warehouse.types";
import type { CustomerGroupView } from "@/modules/pricing/types/customer-group.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

// Create + list + get only — no update/delete exists on the backend yet
// (see Docs/business-rules/discounts-and-coupons.md -> Status), so unlike
// the earlier CRUD modules there's no edit/delete action here.
const NONE = "__none__";

const columns: DataTableColumn<PriceListView>[] = [
  { key: "name", header: "Name" },
  { key: "currency", header: "Currency" },
  { key: "isDefault", header: "Default", render: (row) => (row.isDefault ? <Badge>Default</Badge> : null) },
  { key: "items", header: "Items", render: (row) => row.items.length },
];

export default function PriceListsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: priceLists, isLoading } = useQuery({
    queryKey: queryKeys.list("price-lists"),
    queryFn: () => apiClient.get<PriceListView[]>("/price-lists"),
  });
  const { data: warehouses } = useQuery({
    queryKey: queryKeys.list("warehouses"),
    queryFn: () => apiClient.get<WarehouseView[]>("/warehouses"),
  });
  const { data: customerGroups } = useQuery({
    queryKey: queryKeys.list("customer-groups"),
    queryFn: () => apiClient.get<CustomerGroupView[]>("/customer-groups"),
  });
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });

  const productOptions = (products?.items ?? []).map((p) => ({ label: `${p.sku} — ${p.name}`, value: p.id }));

  const defaultFormValues = {
    name: "",
    warehouseId: NONE,
    customerGroupId: NONE,
    currency: "INR",
    isDefault: false,
    items: [{ productId: "", price: "", minQuantity: "" }],
  };

  const form = useForm<FieldValues>({
    resolver: zodResolver(createPriceListSchema as never),
    defaultValues: defaultFormValues,
  });

  const createMutation = useMutation({
    mutationFn: (values: FieldValues) => apiClient.post<PriceListView>("/price-lists", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.list("price-lists") });
      toast.success("Price list created");
      setCreateOpen(false);
      form.reset(defaultFormValues);
    },
  });

  const onSubmit = async (values: FieldValues) => {
    try {
      const payload = {
        ...values,
        warehouseId: values.warehouseId === NONE ? undefined : values.warehouseId,
        customerGroupId: values.customerGroupId === NONE ? undefined : values.customerGroupId,
        items: (values.items as { productId: string; price: string; minQuantity?: string }[]).map((item) => ({
          ...item,
          minQuantity: item.minQuantity || undefined,
        })),
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
          <h1 className="text-2xl font-semibold font-heading">Price Lists</h1>
          <p className="text-muted-foreground">
            Per-warehouse or per-customer-group pricing tiers — see Docs/business-rules/pricing.md for how these
            resolve.
          </p>
        </div>
        {can("PRICE_LIST.CREATE") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New price list
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={priceLists ?? []}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        emptyMessage="No price lists yet."
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New price list</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Wholesale Pricing" {...form.register("name")} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Warehouse (optional)</Label>
                <Controller
                  control={form.control}
                  name="warehouseId"
                  render={({ field }) => (
                    <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All warehouses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>All warehouses</SelectItem>
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
              <div className="space-y-1.5">
                <Label>Customer group (optional)</Label>
                <Controller
                  control={form.control}
                  name="customerGroupId"
                  render={({ field }) => (
                    <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All customers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>All customers</SelectItem>
                        {(customerGroups ?? []).map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
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
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" placeholder="INR" {...form.register("currency")} />
              </div>
              <div className="flex items-end gap-2 pb-1.5">
                <Controller
                  control={form.control}
                  name="isDefault"
                  render={({ field }) => (
                    <Checkbox id="isDefault" checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  )}
                />
                <Label htmlFor="isDefault" className="font-normal">
                  Default price list
                </Label>
              </div>
            </div>

            <LineItemsField
              control={form.control}
              name="items"
              productOptions={productOptions}
              columns={[
                { name: "price", label: "Price" },
                { name: "minQuantity", label: "Min qty", placeholder: "optional" },
              ]}
              emptyItem={{ productId: "", price: "", minQuantity: "" }}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating…" : "Create price list"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
