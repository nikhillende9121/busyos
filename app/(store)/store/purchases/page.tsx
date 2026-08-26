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
import { createPurchaseSchema } from "@/modules/purchase/schema/purchase.schema";
import type { PurchaseView } from "@/modules/purchase/types/purchase.types";
import type { SupplierView } from "@/modules/supplier/types/supplier.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { ExtraChargeView } from "@/modules/extra-charge/types/extra-charge.types";
import type { Paginated } from "@/shared/utils/pagination";

type Row = PurchaseView & { supplierName: string };

// Trimmed copy of app/(dashboard)/purchases/page.tsx — no warehouse
// picker, defaults from the caller's own scope. See
// Docs/STORE_APP_GUIDE.md.
export default function StorePurchasesPage() {
  const queryClient = useQueryClient();
  const { can, user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: purchases, isLoading } = useQuery({
    queryKey: queryKeys.list("purchases"),
    queryFn: () => apiClient.get<PurchaseView[]>("/purchases"),
  });
  const { data: suppliers } = useQuery({
    queryKey: queryKeys.list("suppliers"),
    queryFn: () => apiClient.get<SupplierView[]>("/suppliers"),
  });
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100, all: true }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100, all: true }),
  });
  const { data: extraCharges } = useQuery({
    queryKey: queryKeys.list("extra-charges"),
    queryFn: () => apiClient.get<ExtraChargeView[]>("/extra-charges"),
  });

  const supplierName = (id: string) => suppliers?.find((s) => s.id === id)?.name ?? id;
  const productOptions = (products?.items ?? []).map((p) => ({ label: `${p.sku} — ${p.name}`, value: p.id }));

  const columns: DataTableColumn<Row>[] = [
    {
      key: "id",
      header: "ID",
      render: (row) => (
        <Link href={`/store/purchases/${row.id}`} className="underline underline-offset-2">
          #{row.id}
        </Link>
      ),
    },
    { key: "supplierName", header: "Supplier" },
    { key: "status", header: "Status", render: (row) => <Badge>{row.status}</Badge> },
    { key: "purchaseDate", header: "Date", render: (row) => new Date(row.purchaseDate).toLocaleDateString() },
  ];

  const rows: Row[] = (purchases ?? []).map((p) => ({ ...p, supplierName: supplierName(p.supplierId) }));

  const defaultFormValues = {
    supplierId: "",
    purchaseDate: new Date().toISOString().slice(0, 10),
    extraChargeIds: [] as string[],
    items: [{ productId: "", quantity: "", price: "" }],
  };

  const form = useForm<FieldValues>({
    resolver: zodResolver(createPurchaseSchema as never),
    defaultValues: defaultFormValues,
  });

  const createMutation = useMutation({
    mutationFn: (values: FieldValues) => apiClient.post<PurchaseView>("/purchases", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.list("purchases") });
      toast.success("Purchase created");
      setCreateOpen(false);
      form.reset(defaultFormValues);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Purchases</h1>
          <p className="text-muted-foreground">Purchase orders received at {user?.warehouseName ?? "your store"}.</p>
        </div>
        {can("PURCHASE.CREATE") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New purchase
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        emptyMessage="No purchases yet."
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New purchase</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Controller
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {(suppliers ?? []).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purchaseDate">Purchase date</Label>
                <Input id="purchaseDate" type="date" {...form.register("purchaseDate")} />
              </div>
            </div>

            <LineItemsField
              control={form.control}
              name="items"
              productOptions={productOptions}
              columns={[
                { name: "quantity", label: "Quantity" },
                { name: "price", label: "Price" },
              ]}
              emptyItem={{ productId: "", quantity: "", price: "" }}
            />

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
                {form.formState.isSubmitting ? "Creating…" : "Create purchase"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
