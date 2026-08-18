"use client";

import { useState } from "react";
import { useForm, Controller, type FieldValues, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import Link from "next/link";
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

// This form has no per-field inline error display (unlike e.g. the login
// page), so a failed zod validation previously meant handleSubmit silently
// never called onSubmit — no toast, no visible reason, nothing.
//
// Named per field rather than a generic walker: shared/validation/id.ts's
// idString rejects an empty/unselected value with "must be a numeric id",
// which is accurate but meaningless to someone who just didn't pick a
// product yet — translate the known fields to what actually needs fixing.
function describeError(errors: FieldErrors): string {
  if (errors.name) {
    return (errors.name.message as string) || "Enter a name for this price list.";
  }
  if (errors.warehouseId) {
    return (errors.warehouseId.message as string) || "Invalid warehouse selected.";
  }
  if (errors.customerGroupId) {
    return (errors.customerGroupId.message as string) || "Invalid customer group selected.";
  }
  if (errors.currency) {
    return (errors.currency.message as string) || "Currency must be a 3-letter code (e.g. INR).";
  }

  const itemsError = errors.items as
    | { message?: string; root?: { message?: string } }
    | { productId?: { message?: string }; price?: { message?: string }; minQuantity?: { message?: string } }[]
    | undefined;

  if (itemsError && !Array.isArray(itemsError)) {
    return itemsError.message ?? itemsError.root?.message ?? "Add at least one product line.";
  }
  if (Array.isArray(itemsError)) {
    const index = itemsError.findIndex((item) => item?.productId || item?.price || item?.minQuantity);
    if (index !== -1) {
      const item = itemsError[index];
      if (item.productId) return `Line ${index + 1}: select a product.`;
      if (item.price) return `Line ${index + 1}: enter a valid price (e.g. 500).`;
      if (item.minQuantity) return `Line ${index + 1}: minimum quantity must be a positive number, or left blank.`;
    }
  }

  return "Check the form — something's missing or invalid.";
}

const columns: DataTableColumn<PriceListView>[] = [
  {
    key: "name",
    header: "Name",
    render: (row) => (
      <Link href={`/price-lists/${row.id}`} className="underline underline-offset-2">
        {row.name}
      </Link>
    ),
  },
  { key: "currency", header: "Currency" },
  { key: "isDefault", header: "Default", render: (row) => (row.isDefault ? <Badge>Default</Badge> : null) },
  { key: "items", header: "Items", render: (row) => row.items.length },
];

export default function PriceListsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

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
      setServerError(null);
      form.reset(defaultFormValues);
    },
  });

  const onSubmit = async (values: FieldValues) => {
    setServerError(null);
    try {
      const payload = {
        ...values,
        warehouseId: values.warehouseId === NONE || !values.warehouseId ? undefined : values.warehouseId,
        customerGroupId: values.customerGroupId === NONE || !values.customerGroupId ? undefined : values.customerGroupId,
        items: (values.items as { productId: string; price: string; minQuantity?: string }[]).map((item) => ({
          ...item,
          minQuantity: item.minQuantity || undefined,
        })),
      };
      await createMutation.mutateAsync(payload);
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : (error as Error)?.message || "Something went wrong. Please try again.";
      setServerError(msg);
      toast.error(msg);
    }
  };

  const onInvalid = (errors: FieldErrors) => {
    const errorMsg = describeError(errors);
    setServerError(errorMsg);
    toast.error(errorMsg);
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
          <Button onClick={() => { setServerError(null); setCreateOpen(true); }}>
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

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setServerError(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New price list</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
            {serverError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive font-medium">
                {serverError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Wholesale Pricing" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message as string}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Warehouse (optional)</Label>
                <Controller
                  control={form.control}
                  name="warehouseId"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(value) => field.onChange(value === NONE ? undefined : value)}
                    >
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
                {form.formState.errors.warehouseId && (
                  <p className="text-xs text-destructive">{form.formState.errors.warehouseId.message as string}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Customer group (optional)</Label>
                <Controller
                  control={form.control}
                  name="customerGroupId"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(value) => field.onChange(value === NONE ? undefined : value)}
                    >
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
                {form.formState.errors.customerGroupId && (
                  <p className="text-xs text-destructive">{form.formState.errors.customerGroupId.message as string}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" placeholder="INR" {...form.register("currency")} />
                {form.formState.errors.currency && (
                  <p className="text-xs text-destructive">{form.formState.errors.currency.message as string}</p>
                )}
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
