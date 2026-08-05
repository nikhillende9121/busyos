"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/resource/confirm-dialog";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import type { StockTransferView } from "@/modules/inventory/types/stock-transfer.types";
import type { InventoryBalanceView } from "@/modules/inventory/types/inventory.types";
import type { WarehouseView } from "@/modules/warehouse/types/warehouse.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

const CANCELLABLE_STATUSES = new Set(["DRAFT", "APPROVED", "IN_TRANSIT"]);

// Lifecycle screen: action buttons are gated by both the transfer's current
// status AND the caller's permission — same two-layer check the API itself
// enforces (shared/middleware/with-api-auth.ts), this is just the UX
// reflection of it. See modules/inventory/service/stock-transfer.service.ts
// for the DRAFT -> APPROVED -> IN_TRANSIT -> COMPLETED lifecycle this
// mirrors, including the per-stage quantity caps (approved <= requested,
// shipped <= approved, received <= shipped).
export default function StockTransferDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
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

  const canApprove = transfer.status === "DRAFT" && can("STOCK_TRANSFER.APPROVE");
  const canShip = transfer.status === "APPROVED" && can("STOCK_TRANSFER.SHIP");
  const canReceive = transfer.status === "IN_TRANSIT" && can("STOCK_TRANSFER.RECEIVE");
  const canCancel = CANCELLABLE_STATUSES.has(transfer.status) && can("STOCK_TRANSFER.UPDATE");

  return (
    <div className="space-y-6">
      <Link href="/stock-transfers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
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
          {canApprove && <Button onClick={() => setApproveOpen(true)}>Approve</Button>}
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

      {approveOpen && (
        <ApproveDialog
          open={approveOpen}
          onOpenChange={setApproveOpen}
          transfer={transfer}
          warehouses={warehouses ?? []}
          productLabel={productLabel}
          onApproved={invalidate}
        />
      )}

      {shipOpen && (
        <ShipDialog
          open={shipOpen}
          onOpenChange={setShipOpen}
          transfer={transfer}
          productLabel={productLabel}
          onShipped={invalidate}
        />
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

// The first point the source warehouse is chosen — request() only knew the
// destination. approvedQuantity defaults to requestedQuantity (the common
// "approve as asked" case is a single click) but is capped server-side at
// that same requestedQuantity per line.
function ApproveDialog({
  open,
  onOpenChange,
  transfer,
  warehouses,
  productLabel,
  onApproved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transfer: StockTransferView;
  warehouses: WarehouseView[];
  productLabel: (productId: string) => string;
  onApproved: () => void;
}) {
  const defaultValues = {
    fromWarehouseId: "",
    ...Object.fromEntries(transfer.items.map((item) => [item.id, item.requestedQuantity])),
  };

  const form = useForm<Record<string, string>>({ defaultValues });

  useEffect(() => {
    form.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fromWarehouseId = form.watch("fromWarehouseId");
  const { data: fromBalances } = useQuery({
    queryKey: queryKeys.list("inventory-balance", { warehouseId: fromWarehouseId }),
    queryFn: () => apiClient.get<InventoryBalanceView[]>("/inventory/balance", { warehouseId: fromWarehouseId }),
    enabled: Boolean(fromWarehouseId),
  });
  const availableQuantity = (productId: string) => fromBalances?.find((b) => b.productId === productId)?.quantity ?? "0";

  const approveMutation = useMutation({
    mutationFn: (data: { fromWarehouseId: string; items: { stockTransferItemId: string; approvedQuantity: string }[] }) =>
      apiClient.post<StockTransferView>(`/stock-transfers/${transfer.id}/approve`, data),
    onSuccess: () => {
      onApproved();
      toast.success("Stock transfer approved");
      onOpenChange(false);
    },
  });

  const onSubmit = async (values: Record<string, string>) => {
    const { fromWarehouseId: selectedFromWarehouseId, ...quantities } = values;
    if (!selectedFromWarehouseId) {
      toast.error("Select a source warehouse.");
      return;
    }
    const items = transfer.items.map((item) => ({
      stockTransferItemId: item.id,
      approvedQuantity: quantities[item.id],
    }));

    try {
      await approveMutation.mutateAsync({ fromWarehouseId: selectedFromWarehouseId, items });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Approve transfer</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>From warehouse</Label>
            <Controller
              control={form.control}
              name="fromWarehouseId"
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select source warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses
                      .filter((w) => w.id !== transfer.toWarehouseId)
                      .map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-3">
            {transfer.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                <div className="flex-1">
                  <p className="text-sm font-medium">{productLabel(item.productId)}</p>
                  <p className="text-xs text-muted-foreground">
                    Requested {item.requestedQuantity}
                    {fromWarehouseId && ` · Available: ${availableQuantity(item.productId)}`}
                  </p>
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
              {form.formState.isSubmitting ? "Approving…" : "Approve"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// shippedQuantity defaults to approvedQuantity, capped server-side at that
// same value — what actually gets packed onto the truck can be less.
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

// receivedQuantity defaults to shippedQuantity, capped server-side at that
// same value — transit loss/damage means less can arrive than was shipped.
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
