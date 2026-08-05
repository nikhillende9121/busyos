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
import type { PurchaseReturnView } from "@/modules/purchase/types/purchase-return.types";
import type { PurchaseView } from "@/modules/purchase/types/purchase.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

// Copy of app/(dashboard)/purchase-returns/page.tsx — no warehouse field
// to trim here (references an existing purchase, already scoped by the
// server). See Docs/STORE_APP_GUIDE.md.
const RETURNABLE_STATUSES = new Set(["RECEIVED", "PARTIALLY_RECEIVED"]);

const columns: DataTableColumn<PurchaseReturnView & { purchaseLabel: string }>[] = [
  { key: "id", header: "ID", render: (row) => `#${row.id}` },
  { key: "purchaseLabel", header: "Purchase" },
  { key: "reason", header: "Reason" },
  { key: "createdAt", header: "Created", render: (row) => new Date(row.createdAt).toLocaleString() },
];

export default function StorePurchaseReturnsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: returns, isLoading } = useQuery({
    queryKey: queryKeys.list("purchase-returns"),
    queryFn: () => apiClient.get<PurchaseReturnView[]>("/purchase-returns"),
  });
  const { data: purchases } = useQuery({
    queryKey: queryKeys.list("purchases"),
    queryFn: () => apiClient.get<PurchaseView[]>("/purchases"),
  });
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });

  const productLabel = (productId: string) => {
    const product = products?.items.find((p) => p.id === productId);
    return product ? `${product.sku} — ${product.name}` : productId;
  };

  const rows = (returns ?? []).map((r) => ({ ...r, purchaseLabel: `#${r.purchaseId}` }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Purchase Returns</h1>
          <p className="text-muted-foreground">Goods sent back to a supplier after receiving.</p>
        </div>
        {can("PURCHASE_RETURN.CREATE") && (
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
        emptyMessage="No purchase returns yet."
      />

      {createOpen && (
        <CreatePurchaseReturnDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          purchases={(purchases ?? []).filter((p) => RETURNABLE_STATUSES.has(p.status))}
          productLabel={productLabel}
          onCreated={() => queryClient.invalidateQueries({ queryKey: queryKeys.list("purchase-returns") })}
        />
      )}
    </div>
  );
}

function CreatePurchaseReturnDialog({
  open,
  onOpenChange,
  purchases,
  productLabel,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchases: PurchaseView[];
  productLabel: (productId: string) => string;
  onCreated: () => void;
}) {
  const [purchaseId, setPurchaseId] = useState<string>("");
  const selectedPurchase = purchases.find((p) => p.id === purchaseId) ?? null;
  const receivedItems = (selectedPurchase?.items ?? []).filter((item) => Number(item.receivedQuantity) > 0);

  const form = useForm<{ reason: string } & Record<string, string>>({
    defaultValues: { reason: "" },
  });

  useEffect(() => {
    form.reset({ reason: "", ...Object.fromEntries(receivedItems.map((item) => [item.id, ""])) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseId]);

  const createMutation = useMutation({
    mutationFn: (values: { purchaseId: string; reason: string; items: { purchaseItemId: string; quantity: string }[] }) =>
      apiClient.post<PurchaseReturnView>("/purchase-returns", values),
    onSuccess: () => {
      onCreated();
      toast.success("Purchase return recorded");
      onOpenChange(false);
      setPurchaseId("");
    },
  });

  const onSubmit = async (values: { reason: string } & Record<string, string>) => {
    if (!selectedPurchase) {
      toast.error("Select a purchase first.");
      return;
    }
    const { reason, ...quantities } = values;
    const items = Object.entries(quantities)
      .filter(([, quantity]) => quantity && Number(quantity) > 0)
      .map(([purchaseItemId, quantity]) => ({ purchaseItemId, quantity }));

    if (items.length === 0) {
      toast.error("Enter a quantity for at least one line.");
      return;
    }

    try {
      await createMutation.mutateAsync({ purchaseId: selectedPurchase.id, reason, items });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New purchase return</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Purchase</Label>
            <Select value={purchaseId} onValueChange={(value) => setPurchaseId(value ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a received purchase" />
              </SelectTrigger>
              <SelectContent>
                {purchases.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    #{p.id} ({p.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Input id="reason" placeholder="Damaged in transit" {...form.register("reason")} />
          </div>

          {selectedPurchase && (
            <div className="space-y-2">
              <Label>Quantity to return per line</Label>
              {receivedItems.length === 0 && (
                <p className="text-sm text-muted-foreground">This purchase has no received lines yet.</p>
              )}
              {receivedItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{productLabel(item.productId)}</p>
                    <p className="text-xs text-muted-foreground">{item.receivedQuantity} received</p>
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
