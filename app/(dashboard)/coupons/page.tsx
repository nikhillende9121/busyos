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
import { createCouponSchema } from "@/modules/pricing/schema/coupon.schema";
import type { CouponView } from "@/modules/pricing/types/coupon.types";

const TYPE_OPTIONS = [
  { label: "Percentage", value: "PERCENTAGE" },
  { label: "Flat", value: "FLAT" },
  { label: "Free shipping", value: "FREE_SHIPPING" },
];
const SCOPE_OPTIONS = [
  { label: "Whole order", value: "ORDER" },
  { label: "Specific products", value: "PRODUCT" },
  { label: "Specific categories", value: "CATEGORY" },
];

const columns: DataTableColumn<CouponView>[] = [
  { key: "code", header: "Code" },
  { key: "type", header: "Type" },
  { key: "value", header: "Value" },
  { key: "scope", header: "Scope", render: (row) => <Badge variant="outline">{row.scope}</Badge> },
  { key: "usageLimitTotal", header: "Usage limit", render: (row) => row.usageLimitTotal ?? "Unlimited" },
  { key: "isActive", header: "Active", render: (row) => (row.isActive ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>) },
];

export default function CouponsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: coupons, isLoading } = useQuery({
    queryKey: queryKeys.list("coupons"),
    queryFn: () => apiClient.get<CouponView[]>("/coupons"),
  });

  const defaultFormValues = {
    code: "",
    type: "PERCENTAGE",
    value: "",
    scope: "ORDER",
    productIds: "",
    categoryIds: "",
    minPurchaseAmount: "",
    maxDiscountAmount: "",
    usageLimitTotal: "",
    usageLimitPerCustomer: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    stackable: false,
  };

  const form = useForm<FieldValues>({
    resolver: zodResolver(createCouponSchema as never),
    defaultValues: defaultFormValues,
  });

  const createMutation = useMutation({
    mutationFn: (values: FieldValues) => apiClient.post<CouponView>("/coupons", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.list("coupons") });
      toast.success("Coupon created");
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
        usageLimitTotal: values.usageLimitTotal ? Number(values.usageLimitTotal) : undefined,
        usageLimitPerCustomer: values.usageLimitPerCustomer ? Number(values.usageLimitPerCustomer) : undefined,
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
          <h1 className="text-2xl font-semibold font-heading">Coupons</h1>
          <p className="text-muted-foreground">Customer-entered codes, individually redeemed and tracked.</p>
        </div>
        {can("COUPON.CREATE") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New coupon
          </Button>
        )}
      </div>

      <DataTable columns={columns} rows={coupons ?? []} isLoading={isLoading} getRowId={(row) => row.id} emptyMessage="No coupons yet." />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New coupon</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input id="code" placeholder="WELCOME20" {...form.register("code")} />
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
                <Input id="value" placeholder="20" {...form.register("value")} />
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
                <Label htmlFor="usageLimitTotal">Total usage limit</Label>
                <Input id="usageLimitTotal" type="number" placeholder="unlimited" {...form.register("usageLimitTotal")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="usageLimitPerCustomer">Per-customer limit</Label>
                <Input id="usageLimitPerCustomer" type="number" placeholder="unlimited" {...form.register("usageLimitPerCustomer")} />
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating…" : "Create coupon"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
