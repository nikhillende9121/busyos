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
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import { createDiscountSchema } from "@/modules/pricing/schema/discount.schema";
import type { DiscountView } from "@/modules/pricing/types/discount.types";

const TYPE_OPTIONS = [
  { label: "Percentage", value: "PERCENTAGE" },
  { label: "Flat", value: "FLAT" },
];
const SCOPE_OPTIONS = [
  { label: "Whole order", value: "ORDER" },
  { label: "Specific products", value: "PRODUCT" },
  { label: "Specific categories", value: "CATEGORY" },
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

  const defaultFormValues = {
    name: "",
    type: "PERCENTAGE",
    value: "",
    scope: "ORDER",
    productIds: "",
    categoryIds: "",
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
      const payload = {
        ...values,
        productIds: values.productIds
          ? String(values.productIds).split(",").map((s: string) => s.trim()).filter(Boolean)
          : undefined,
        categoryIds: values.categoryIds
          ? String(values.categoryIds).split(",").map((s: string) => s.trim()).filter(Boolean)
          : undefined,
        minPurchaseAmount: values.minPurchaseAmount || undefined,
        maxDiscountAmount: values.maxDiscountAmount || undefined,
        endDate: values.endDate || undefined,
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New discount</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="10% Off Everything" {...form.register("name")} />
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
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="value">Value</Label>
                <Input id="value" placeholder="10" {...form.register("value")} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Controller
                control={form.control}
                name="scope"
                render={({ field }) => (
                  <Select value={field.value ?? "ORDER"} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCOPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="productIds">Product IDs (comma-separated)</Label>
              <Input id="productIds" placeholder="required if scope is Specific products" {...form.register("productIds")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="categoryIds">Category IDs (comma-separated)</Label>
              <Input id="categoryIds" placeholder="required if scope is Specific categories" {...form.register("categoryIds")} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="minPurchaseAmount">Min purchase amount</Label>
                <Input id="minPurchaseAmount" placeholder="optional" {...form.register("minPurchaseAmount")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxDiscountAmount">Max discount amount</Label>
                <Input id="maxDiscountAmount" placeholder="optional" {...form.register("maxDiscountAmount")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="startDate">Start date</Label>
                <Input id="startDate" type="date" {...form.register("startDate")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endDate">End date</Label>
                <Input id="endDate" type="date" placeholder="optional" {...form.register("endDate")} />
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
                <Input id="priority" type="number" {...form.register("priority", { valueAsNumber: true })} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating…" : "Create discount"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
