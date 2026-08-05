"use client";

import { useState } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { LineItemsField } from "@/components/resource/line-items-field";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import { createStockTransferSchema } from "@/modules/inventory/schema/stock-transfer.schema";
import type { StockTransferView } from "@/modules/inventory/types/stock-transfer.types";
import type { WarehouseView } from "@/modules/warehouse/types/warehouse.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

type Row = StockTransferView & { fromName: string; toName: string };

// Trimmed copy of app/(dashboard)/stock-transfers/page.tsx — no "To
// warehouse" picker on create, since a Store Manager can only ever
// request stock into their own store; defaults from the caller's scope.
// See Docs/STORE_APP_GUIDE.md.
export default function StoreStockTransfersPage() {
  const queryClient = useQueryClient();
  const { can, user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: transfers, isLoading } = useQuery({
    queryKey: queryKeys.list("stock-transfers"),
    queryFn: () => apiClient.get<StockTransferView[]>("/stock-transfers"),
  });
  const { data: warehouses } = useQuery({
    queryKey: queryKeys.list("warehouses"),
    queryFn: () => apiClient.get<WarehouseView[]>("/warehouses"),
  });
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });

  const warehouseName = (id: string | null) => (id ? (warehouses?.find((w) => w.id === id)?.name ?? id) : "—");
  const productOptions = (products?.items ?? []).map((p) => ({ label: `${p.sku} — ${p.name}`, value: p.id }));

  const columns: DataTableColumn<Row>[] = [
    {
      key: "id",
      header: "ID",
      render: (row) => (
        <Link href={`/store/stock-transfers/${row.id}`} className="underline underline-offset-2">
          #{row.id}
        </Link>
      ),
    },
    { key: "fromName", header: "From" },
    { key: "toName", header: "To" },
    { key: "status", header: "Status", render: (row) => <Badge>{row.status}</Badge> },
    { key: "transferDate", header: "Date", render: (row) => new Date(row.transferDate).toLocaleDateString() },
  ];

  const rows: Row[] = (transfers ?? []).map((t) => ({
    ...t,
    fromName: warehouseName(t.fromWarehouseId),
    toName: warehouseName(t.toWarehouseId),
  }));

  const defaultFormValues = {
    transferDate: new Date().toISOString().slice(0, 10),
    items: [{ productId: "", requestedQuantity: "" }],
  };

  const form = useForm<FieldValues>({
    resolver: zodResolver(createStockTransferSchema as never),
    defaultValues: defaultFormValues,
  });

  const createMutation = useMutation({
    mutationFn: (values: FieldValues) => apiClient.post<StockTransferView>("/stock-transfers", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.list("stock-transfers") });
      toast.success("Stock transfer created");
      setCreateOpen(false);
      form.reset(defaultFormValues);
    },
  });

  const onSubmit = async (values: FieldValues) => {
    try {
      await createMutation.mutateAsync({ ...values, toWarehouseId: user!.warehouseId });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Stock Transfers</h1>
          <p className="text-muted-foreground">Requests to move stock into or out of {user?.warehouseName ?? "your store"}.</p>
        </div>
        {can("STOCK_TRANSFER.CREATE") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New transfer
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        emptyMessage="No stock transfers yet."
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New stock transfer</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Requests stock into {user?.warehouseName ?? "your store"} — the source warehouse is chosen later, when
              this request is approved.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="transferDate">Transfer date</Label>
              <Input id="transferDate" type="date" {...form.register("transferDate")} />
            </div>

            <LineItemsField
              control={form.control}
              name="items"
              productOptions={productOptions}
              columns={[{ name: "requestedQuantity", label: "Requested quantity" }]}
              emptyItem={{ productId: "", requestedQuantity: "" }}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating…" : "Create transfer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
