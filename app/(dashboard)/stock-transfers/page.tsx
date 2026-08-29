"use client";

import { useEffect, useState } from "react";
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
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { DateRangeFilter, type DateRange } from "@/components/resource/date-range-filter";
import { ExportButton } from "@/components/resource/export-button";
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

export default function StockTransfersPage() {
  const queryClient = useQueryClient();
  const { can, user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<DateRange>({});
  // A warehouse-scoped user (Store Manager role reaching this page instead
  // of /store) can only ever request stock into their own store — the
  // server rejects any other toWarehouseId (assertWarehouseAccess in
  // stock-transfer.service.ts), so don't make them pick it themselves.
  const scopedWarehouseId = user?.warehouseId ?? null;

  const { data: transfersPage, isLoading } = useQuery({
    queryKey: queryKeys.list("stock-transfers", { page, ...dateRange }),
    queryFn: () =>
      apiClient.get<Paginated<StockTransferView>>("/stock-transfers", { page, pageSize: 20, ...dateRange }),
  });
  const transfers = transfersPage?.items;
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
        <Link href={`/stock-transfers/${row.id}`} className="underline underline-offset-2">
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
    toWarehouseId: scopedWarehouseId ?? "",
    transferDate: new Date().toISOString().slice(0, 10),
    items: [{ productId: "", requestedQuantity: "" }],
  };

  const form = useForm<FieldValues>({
    // Cast: zodResolver's generic doesn't forward cleanly through a
    // schema-agnostic FieldValues form (same friction as
    // components/resource/resource-form-dialog.tsx).
    resolver: zodResolver(createStockTransferSchema as never),
    defaultValues: defaultFormValues,
  });

  // `user` (and so scopedWarehouseId) loads async after this form's initial
  // mount — seed toWarehouseId once it arrives so a scoped user isn't
  // blocked by "required" validation on a field they never see a picker for.
  useEffect(() => {
    if (scopedWarehouseId) {
      form.setValue("toWarehouseId", scopedWarehouseId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedWarehouseId]);

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
      await createMutation.mutateAsync(values);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Stock Transfers</h1>
          <p className="text-muted-foreground">Move stock between two of this tenant&apos;s warehouses.</p>
        </div>
        {can("STOCK_TRANSFER.CREATE") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New transfer
          </Button>
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        <DateRangeFilter
          value={dateRange}
          onChange={(next) => {
            setDateRange(next);
            setPage(1);
          }}
        />
        <ExportButton resource="stock-transfers" params={dateRange} />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        emptyMessage="No stock transfers yet."
        pagination={transfersPage?.pagination}
        onPageChange={setPage}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New stock transfer</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The source warehouse is chosen later, when this request is approved.
            </p>
            {scopedWarehouseId ? (
              <div className="space-y-1.5">
                <Label>To warehouse</Label>
                <p className="text-sm">{user?.warehouseName ?? scopedWarehouseId}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>To warehouse</Label>
                <Controller
                  control={form.control}
                  name="toWarehouseId"
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
            )}

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
