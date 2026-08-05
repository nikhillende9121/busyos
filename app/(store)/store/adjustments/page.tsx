"use client";

import { useForm, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LineItemsField } from "@/components/resource/line-items-field";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import { createStockAdjustmentSchema } from "@/modules/inventory/schema/inventory.schema";
import type { StockAdjustmentView } from "@/modules/inventory/types/inventory.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

// Trimmed copy of app/(dashboard)/inventory/adjustments/page.tsx — no
// warehouse picker, defaults from the caller's own scope. Create-only,
// same as the admin version (no list endpoint exists for these). See
// Docs/STORE_APP_GUIDE.md.
export default function StoreAdjustmentsPage() {
  const { user } = useAuth();
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });

  const productOptions = (products?.items ?? []).map((p) => ({ label: `${p.sku} — ${p.name}`, value: p.id }));

  const form = useForm<FieldValues>({
    resolver: zodResolver(createStockAdjustmentSchema as never),
    defaultValues: { reason: "", items: [{ productId: "", quantityDelta: "" }] },
  });

  const createMutation = useMutation({
    mutationFn: (values: FieldValues) => apiClient.post<StockAdjustmentView>("/stock-adjustments", values),
    onSuccess: () => {
      toast.success("Stock adjustment recorded");
      form.reset({ reason: "", items: [{ productId: "", quantityDelta: "" }] });
    },
  });

  const onSubmit = async (values: FieldValues) => {
    try {
      await createMutation.mutateAsync({ ...values, warehouseId: user!.warehouseId });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold font-heading">Stock Adjustments</h1>
        <p className="text-muted-foreground">
          Manually correct stock levels at {user?.warehouseName ?? "your store"} (e.g. after a physical count or
          damage) — each line writes to the inventory ledger immediately.
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
