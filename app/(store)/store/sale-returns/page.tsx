"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import type { SaleReturnView } from "@/modules/sales/types/sale-return.types";
import type { SaleView } from "@/modules/sales/types/sale.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

// Copy of app/(dashboard)/sale-returns/page.tsx — nothing to trim here,
// there's no warehouse field on a sale return (it references an existing
// sale, and GET /sales already comes back scoped to the caller's own
// store). See Docs/STORE_APP_GUIDE.md.
const RETURNABLE_STATUSES = new Set(["CONFIRMED", "COMPLETED"]);

const columns: DataTableColumn<SaleReturnView & { saleLabel: string }>[] = [
  { key: "id", header: "ID", render: (row) => `#${row.id}` },
  { key: "saleLabel", header: "Sale" },
  { key: "reason", header: "Reason" },
  { key: "totalRefundAmount", header: "Refund", render: (row) => `${row.totalRefundAmount}` },
  { key: "createdAt", header: "Created", render: (row) => new Date(row.createdAt).toLocaleString() },
];

export default function StoreSaleReturnsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: returns, isLoading } = useQuery({
    queryKey: queryKeys.list("sale-returns"),
    queryFn: () => apiClient.get<SaleReturnView[]>("/sale-returns"),
  });
  const { data: sales } = useQuery({
    queryKey: queryKeys.list("sales"),
    queryFn: () => apiClient.get<SaleView[]>("/sales"),
  });
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });

  const productLabel = (productId: string) => {
    const product = products?.items.find((p) => p.id === productId);
    return product ? `${product.sku} — ${product.name}` : productId;
  };

  const rows = (returns ?? []).map((r) => ({ ...r, saleLabel: `#${r.saleId}` }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Sale Returns</h1>
          <p className="text-muted-foreground">Goods returned by a customer, refunded at the discounted price paid.</p>
        </div>
        {can("SALE_RETURN.CREATE") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New return
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        emptyMessage="No sale returns yet."
      />

      {createOpen && (
        <CreateSaleReturnDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          sales={(sales ?? []).filter((s) => RETURNABLE_STATUSES.has(s.status))}
          productLabel={productLabel}
          onCreated={() => queryClient.invalidateQueries({ queryKey: queryKeys.list("sale-returns") })}
        />
      )}
    </div>
  );
}

function CreateSaleReturnDialog({
  open,
  onOpenChange,
  sales,
  productLabel,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sales: SaleView[];
  productLabel: (productId: string) => string;
  onCreated: () => void;
}) {
  const [saleId, setSaleId] = useState<string>("");
  const selectedSale = sales.find((s) => s.id === saleId) ?? null;

  const form = useForm<{ reason: string } & Record<string, string>>({
    defaultValues: { reason: "" },
  });

  useEffect(() => {
    form.reset({ reason: "", ...Object.fromEntries((selectedSale?.items ?? []).map((item) => [item.id, ""])) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId]);

  const createMutation = useMutation({
    mutationFn: (values: { saleId: string; reason: string; items: { saleItemId: string; quantity: string }[] }) =>
      apiClient.post<SaleReturnView>("/sale-returns", values),
    onSuccess: () => {
      onCreated();
      toast.success("Sale return recorded");
      onOpenChange(false);
      setSaleId("");
    },
  });

  const onSubmit = async (values: { reason: string } & Record<string, string>) => {
    if (!selectedSale) {
      toast.error("Select a sale first.");
      return;
    }
    const { reason, ...quantities } = values;
    const items = Object.entries(quantities)
      .filter(([, quantity]) => quantity && Number(quantity) > 0)
      .map(([saleItemId, quantity]) => ({ saleItemId, quantity }));

    if (items.length === 0) {
      toast.error("Enter a quantity for at least one line.");
      return;
    }

    try {
      await createMutation.mutateAsync({ saleId: selectedSale.id, reason, items });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New sale return</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Sale</Label>
            <Select value={saleId} onValueChange={(value) => setSaleId(value ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a confirmed/completed sale" />
              </SelectTrigger>
              <SelectContent>
                {sales.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    #{s.id} ({s.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Input id="reason" placeholder="Customer changed mind" {...form.register("reason")} />
          </div>

          {selectedSale && (
            <div className="space-y-2">
              <Label>Quantity to return per line</Label>
              {selectedSale.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{productLabel(item.productId)}</p>
                    <p className="text-xs text-muted-foreground">{item.quantity} sold</p>
                  </div>
                  <Input className="w-28" placeholder="0" {...form.register(item.id)} />
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating…" : "Create return"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
