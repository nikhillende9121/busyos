"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/resource/confirm-dialog";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import type { StockTransferView } from "@/modules/inventory/types/stock-transfer.types";
import type { WarehouseView } from "@/modules/warehouse/types/warehouse.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

const CANCELLABLE_STATUSES = new Set(["DRAFT", "APPROVED", "IN_TRANSIT"]);

// Trimmed copy of app/(dashboard)/stock-transfers/[id]/page.tsx — Ship/
// Receive/Cancel only, deliberately no Approve action (and no
// STOCK_TRANSFER.APPROVE check at all): approving picks the *source*
// warehouse, a cross-store decision that belongs to an admin, not a
// single store's own manager — see Docs/MOBILE_API_GUIDE.md §5/§7 and
// Docs/STORE_APP_GUIDE.md.
export default function StoreStockTransferDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const { data: transfer, isLoading } = useQuery({
    queryKey: queryKeys.detail("stock-transfers", id),
    queryFn: () => apiClient.get<StockTransferView>(`/stock-transfers/${id}`),
  });
  const { data: warehouses } = useQuery({
    queryKey: queryKeys.list("warehouses"),
    queryFn: () => apiClient.get<WarehouseView[]>("/warehouses"),
  });
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });

  const warehouseName = (whId: string | null) => (whId ? (warehouses?.find((w) => w.id === whId)?.name ?? whId) : "—");
  const productLabel = (productId: string) => {
    const product = products?.items.find((p) => p.id === productId);
    return product ? `${product.sku} — ${product.name}` : productId;
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.detail("stock-transfers", id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.list("stock-transfers") });
    queryClient.invalidateQueries({ queryKey: queryKeys.list("inventory-balance") });
  };

  const cancelMutation = useMutation({
    mutationFn: () => apiClient.post<StockTransferView>(`/stock-transfers/${id}/cancel`),
    onSuccess: () => {
      invalidate();
      toast.success("Stock transfer cancelled");
    },
  });

  if (isLoading || !transfer) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const canShip = transfer.status === "APPROVED" && can("STOCK_TRANSFER.SHIP");
  const canReceive = transfer.status === "IN_TRANSIT" && can("STOCK_TRANSFER.RECEIVE");
  const canCancel = CANCELLABLE_STATUSES.has(transfer.status) && can("STOCK_TRANSFER.UPDATE");

  return (
    <div className="space-y-6">
      <Link
        href="/store/stock-transfers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to stock transfers
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Transfer #{transfer.id}</h1>
          <p className="text-muted-foreground">
            {warehouseName(transfer.fromWarehouseId)} → {warehouseName(transfer.toWarehouseId)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{transfer.status}</Badge>
          {canShip && <Button onClick={() => setShipOpen(true)}>Ship</Button>}
          {canReceive && <Button onClick={() => setReceiveOpen(true)}>Receive</Button>}
          {canCancel && (
            <Button variant="outline" onClick={() => setConfirmingCancel(true)}>
              Cancel transfer
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead>Shipped</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfer.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{productLabel(item.productId)}</TableCell>
                  <TableCell>{item.requestedQuantity}</TableCell>
                  <TableCell>{item.approvedQuantity ?? "—"}</TableCell>
                  <TableCell>{item.shippedQuantity ?? "—"}</TableCell>
                  <TableCell>{item.receivedQuantity ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {confirmingCancel && (
        <ConfirmDialog
          open={confirmingCancel}
          onOpenChange={setConfirmingCancel}
          title="Cancel this transfer?"
          description={
            transfer.status === "IN_TRANSIT"
              ? "Stock already shipped will be credited back to the source warehouse."
              : "This transfer never moved any stock."
          }
          confirmLabel="Cancel transfer"
          destructive
          onConfirm={async () => {
            await cancelMutation.mutateAsync();
          }}
        />
      )}

      {shipOpen && (
        <ShipDialog open={shipOpen} onOpenChange={setShipOpen} transfer={transfer} productLabel={productLabel} onShipped={invalidate} />
      )}

      {receiveOpen && (
        <ReceiveDialog
          open={receiveOpen}
          onOpenChange={setReceiveOpen}
          transfer={transfer}
          productLabel={productLabel}
          onReceived={invalidate}
        />
      )}
    </div>
  );
}

function ShipDialog({
  open,
  onOpenChange,
  transfer,
  productLabel,
  onShipped,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transfer: StockTransferView;
  productLabel: (productId: string) => string;
  onShipped: () => void;
}) {
  const defaultValues = Object.fromEntries(transfer.items.map((item) => [item.id, item.approvedQuantity ?? ""]));

  const form = useForm<Record<string, string>>({ defaultValues });

  useEffect(() => {
    form.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shipMutation = useMutation({
    mutationFn: (items: { stockTransferItemId: string; shippedQuantity: string }[]) =>
      apiClient.post<StockTransferView>(`/stock-transfers/${transfer.id}/ship`, { items }),
    onSuccess: () => {
      onShipped();
      toast.success("Stock transfer shipped");
      onOpenChange(false);
    },
  });

  const onSubmit = async (values: Record<string, string>) => {
    const items = transfer.items.map((item) => ({ stockTransferItemId: item.id, shippedQuantity: values[item.id] }));
    try {
      await shipMutation.mutateAsync(items);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ship transfer</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-3">
            {transfer.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                <div className="flex-1">
                  <p className="text-sm font-medium">{productLabel(item.productId)}</p>
                  <p className="text-xs text-muted-foreground">Approved {item.approvedQuantity}</p>
                </div>
                <Input className="w-28" {...form.register(item.id)} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Shipping…" : "Ship"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveDialog({
  open,
  onOpenChange,
  transfer,
  productLabel,
  onReceived,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transfer: StockTransferView;
  productLabel: (productId: string) => string;
  onReceived: () => void;
}) {
  const defaultValues = Object.fromEntries(transfer.items.map((item) => [item.id, item.shippedQuantity ?? ""]));

  const form = useForm<Record<string, string>>({ defaultValues });

  useEffect(() => {
    form.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const receiveMutation = useMutation({
    mutationFn: (items: { stockTransferItemId: string; receivedQuantity: string }[]) =>
      apiClient.post<StockTransferView>(`/stock-transfers/${transfer.id}/receive`, { items }),
    onSuccess: () => {
      onReceived();
      toast.success("Stock transfer received");
      onOpenChange(false);
    },
  });

  const onSubmit = async (values: Record<string, string>) => {
    const items = transfer.items.map((item) => ({ stockTransferItemId: item.id, receivedQuantity: values[item.id] }));
    try {
      await receiveMutation.mutateAsync(items);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Receive transfer</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-3">
            {transfer.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                <div className="flex-1">
                  <p className="text-sm font-medium">{productLabel(item.productId)}</p>
                  <p className="text-xs text-muted-foreground">Shipped {item.shippedQuantity}</p>
                </div>
                <Input className="w-28" {...form.register(item.id)} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Receiving…" : "Receive"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
