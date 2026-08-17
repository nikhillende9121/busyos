"use client";

import { useState } from "react";
import { useForm, Controller, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoaderButton } from "@/components/ui/loader-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { MultiSelectPicker } from "@/components/resource/multi-select-picker";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import { createDiscountSchema } from "@/modules/pricing/schema/discount.schema";
import type { DiscountView } from "@/modules/pricing/types/discount.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

type CategoryOption = { id: string; name: string };
type CustomerOption = { id: string; name: string };
type CustomerGroupOption = { id: string; name: string };

const TYPE_OPTIONS = [
  { label: "Percentage", value: "PERCENTAGE" },
  { label: "Flat", value: "FLAT" },
];

const columns: DataTableColumn<DiscountView>[] = [
  { key: "name", header: "Name" },
  { key: "type", header: "Type" },
  { key: "value", header: "Value" },
  { key: "scope", header: "Scope", render: (row) => <Badge variant="outline">{row.scope}</Badge> },
  { key: "stackable", header: "Stackable", render: (row) => (row.stackable ? "Yes" : "No") },
  { key: "isActive", header: "Active", render: (row) => (row.isActive ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>) },
];

export default function DiscountsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: discounts, isLoading } = useQuery({
    queryKey: queryKeys.list("discounts"),
    queryFn: () => apiClient.get<DiscountView[]>("/discounts"),
  });
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });
  const { data: categories } = useQuery({
    queryKey: queryKeys.list("categories"),
    queryFn: () => apiClient.get<CategoryOption[]>("/categories"),
  });
  const { data: customers } = useQuery({
    queryKey: queryKeys.list("customers"),
    queryFn: () => apiClient.get<CustomerOption[]>("/customers"),
  });
  const { data: customerGroups } = useQuery({
    queryKey: queryKeys.list("customer-groups"),
    queryFn: () => apiClient.get<CustomerGroupOption[]>("/customer-groups"),
  });

  const productOptions = (products?.items ?? []).map((p) => ({ label: `${p.sku} — ${p.name}`, value: p.id }));
  const categoryOptions = (categories ?? []).map((c) => ({ label: c.name, value: c.id }));
  const customerOptions = (customers ?? []).map((c) => ({ label: c.name, value: c.id }));
  const customerGroupOptions = (customerGroups ?? []).map((g) => ({ label: g.name, value: g.id }));

  const defaultFormValues = {
    name: "",
    type: "PERCENTAGE",
    value: "",
    scope: "ORDER",
    productIds: [] as string[],
    categoryIds: [] as string[],
    customerId: "",
    customerGroupId: "",
    minPurchaseAmount: "",
    maxDiscountAmount: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    stackable: false,
    priority: 0,
  };

  const form = useForm<FieldValues>({
    resolver: zodResolver(createDiscountSchema as never),
    defaultValues: defaultFormValues,
  });

  const createMutation = useMutation({
    mutationFn: (values: FieldValues) => apiClient.post<DiscountView>("/discounts", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.list("discounts") });
      toast.success("Discount created");
      setCreateOpen(false);
      form.reset(defaultFormValues);
    },
  });

  const onSubmit = async (values: FieldValues) => {
    try {
      const hasProducts = values.productIds && values.productIds.length > 0;
      const hasCategories = values.categoryIds && values.categoryIds.length > 0;
      const autoScope = hasProducts ? "PRODUCT" : hasCategories ? "CATEGORY" : "ORDER";

      const payload = {
        ...values,
        scope: autoScope,
        productIds: hasProducts ? values.productIds : undefined,
        categoryIds: hasCategories ? values.categoryIds : undefined,
        customerId: values.customerId || undefined,
        customerGroupId: values.customerGroupId || undefined,
        minPurchaseAmount: values.minPurchaseAmount || undefined,
        maxDiscountAmount: values.maxDiscountAmount || undefined,
        endDate: values.endDate || undefined,
      };
      await createMutation.mutateAsync(payload);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  const onInvalid = (errors: FieldValues) => {
    const firstError = Object.values(errors)[0];
    const message = firstError?.message ? String(firstError.message) : "Please fix form errors before submitting.";
    toast.error(message);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Discounts</h1>
          <p className="text-muted-foreground">Automatic rules applied with no customer action.</p>
        </div>
        {can("DISCOUNT.CREATE") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New discount
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={discounts ?? []}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        emptyMessage="No discounts yet."
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New discount</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="10% Off Everything" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{String(form.formState.errors.name.message)}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Controller
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <Select value={field.value ?? "PERCENTAGE"} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.type && (
                  <p className="text-xs text-destructive">{String(form.formState.errors.type.message)}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="value">Value</Label>
                <Input id="value" placeholder="10" {...form.register("value")} />
                {form.formState.errors.value && (
                  <p className="text-xs text-destructive">{String(form.formState.errors.value.message)}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Products (optional — select multiple)</Label>
              <Controller
                control={form.control}
                name="productIds"
                render={({ field }) => (
                  <MultiSelectPicker
                    options={productOptions}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    placeholder="Select products (multiple supported)…"
                  />
                )}
              />
              {form.formState.errors.productIds && (
                <p className="text-xs text-destructive">{String(form.formState.errors.productIds.message)}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Categories (optional — select multiple)</Label>
              <Controller
                control={form.control}
                name="categoryIds"
                render={({ field }) => (
                  <MultiSelectPicker
                    options={categoryOptions}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    placeholder="Select categories (multiple supported)…"
                  />
                )}
              />
              {form.formState.errors.categoryIds && (
                <p className="text-xs text-destructive">{String(form.formState.errors.categoryIds.message)}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Customer (optional)</Label>
                <Controller
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Any customer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Any customer</SelectItem>
                        {customerOptions.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
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
                <Label>Customer group (optional)</Label>
                <Controller
                  control={form.control}
                  name="customerGroupId"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Any group" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Any group</SelectItem>
                        {customerGroupOptions.map((g) => (
                          <SelectItem key={g.value} value={g.value}>
                            {g.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.customerGroupId && (
                  <p className="text-xs text-destructive">{String(form.formState.errors.customerGroupId.message)}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="minPurchaseAmount">Min purchase amount</Label>
                <Input id="minPurchaseAmount" placeholder="optional" {...form.register("minPurchaseAmount")} />
                {form.formState.errors.minPurchaseAmount && (
                  <p className="text-xs text-destructive">{String(form.formState.errors.minPurchaseAmount.message)}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxDiscountAmount">Max discount amount</Label>
                <Input id="maxDiscountAmount" placeholder="optional" {...form.register("maxDiscountAmount")} />
                {form.formState.errors.maxDiscountAmount && (
                  <p className="text-xs text-destructive">{String(form.formState.errors.maxDiscountAmount.message)}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="startDate">Start date</Label>
                <Input id="startDate" type="date" {...form.register("startDate")} />
                {form.formState.errors.startDate && (
                  <p className="text-xs text-destructive">{String(form.formState.errors.startDate.message)}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endDate">End date</Label>
                <Input id="endDate" type="date" placeholder="optional" {...form.register("endDate")} />
                {form.formState.errors.endDate && (
                  <p className="text-xs text-destructive">{String(form.formState.errors.endDate.message)}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Controller
                  control={form.control}
                  name="stackable"
                  render={({ field }) => (
                    <Checkbox id="stackable" checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  )}
                />
                <Label htmlFor="stackable" className="font-normal">
                  Stackable
                </Label>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="priority">Priority</Label>
                <Input id="priority" type="number" {...form.register("priority")} />
                {form.formState.errors.priority && (
                  <p className="text-xs text-destructive">{String(form.formState.errors.priority.message)}</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <LoaderButton type="submit" loading={form.formState.isSubmitting}>
                Create discount
              </LoaderButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
