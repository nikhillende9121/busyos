"use client";

import { useForm, Controller, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineItemsField } from "@/components/resource/line-items-field";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { createStockAdjustmentSchema } from "@/modules/inventory/schema/inventory.schema";
import type { StockAdjustmentView } from "@/modules/inventory/types/inventory.types";
import type { WarehouseView } from "@/modules/warehouse/types/warehouse.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

// Create-only (no list/detail endpoint exists for stock adjustments) — a
// single form is the whole page, not a DataTable + dialog.
export default function StockAdjustmentsPage() {
  const { data: warehouses } = useQuery({
    queryKey: queryKeys.list("warehouses"),
    queryFn: () => apiClient.get<WarehouseView[]>("/warehouses"),
  });
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });

  const productOptions = (products?.items ?? []).map((p) => ({ label: `${p.sku} — ${p.name}`, value: p.id }));

  const form = useForm<FieldValues>({
    // Cast: zodResolver's generic doesn't forward cleanly through a
    // schema-agnostic FieldValues form (same friction as
    // components/resource/resource-form-dialog.tsx).
    resolver: zodResolver(createStockAdjustmentSchema as never),
    defaultValues: { warehouseId: "", reason: "", items: [{ productId: "", quantityDelta: "" }] },
  });

  const createMutation = useMutation({
    mutationFn: (values: FieldValues) => apiClient.post<StockAdjustmentView>("/stock-adjustments", values),
    onSuccess: () => {
      toast.success("Stock adjustment recorded");
      form.reset({ warehouseId: "", reason: "", items: [{ productId: "", quantityDelta: "" }] });
    },
  });

  const onSubmit = async (values: FieldValues) => {
    try {
      await createMutation.mutateAsync(values);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold font-heading">Stock Adjustments</h1>
        <p className="text-muted-foreground">
          Manually correct stock levels (e.g. after a physical count or damage) — each line writes to the
          inventory ledger immediately.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>New adjustment</CardTitle>
          <CardDescription>A positive quantity adds stock, a negative quantity removes it.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="warehouseId">Warehouse</Label>
              <Controller
                control={form.control}
                name="warehouseId"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger id="warehouseId" className="w-full">
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

            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Input id="reason" placeholder="Physical stock count" {...form.register("reason")} />
            </div>

            <LineItemsField
              control={form.control}
              name="items"
              productOptions={productOptions}
              columns={[{ name: "quantityDelta", label: "Quantity delta", placeholder: "e.g. -3 or 10" }]}
              emptyItem={{ productId: "", quantityDelta: "" }}
            />

            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Record adjustment"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
