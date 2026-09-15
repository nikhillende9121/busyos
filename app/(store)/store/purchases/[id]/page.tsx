"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft, Plus, X } from "lucide-react";
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
import type { PurchaseView } from "@/modules/purchase/types/purchase.types";
import type { SupplierView } from "@/modules/supplier/types/supplier.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

// Trimmed copy of app/(dashboard)/purchases/[id]/page.tsx — no
// warehouse name in the header. See Docs/STORE_APP_GUIDE.md.
const RECEIVABLE_STATUSES = new Set(["ORDERED", "PARTIALLY_RECEIVED"]);
const CANCELLABLE_STATUSES = new Set(["DRAFT", "ORDERED"]);

export default function StorePurchaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const { data: purchase, isLoading } = useQuery({
    queryKey: queryKeys.detail("purchases", id),
    queryFn: () => apiClient.get<PurchaseView>(`/purchases/${id}`),
  });
  const { data: suppliers } = useQuery({
    queryKey: queryKeys.list("suppliers"),
    queryFn: () => apiClient.get<SupplierView[]>("/suppliers"),
  });
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });

  const productLabel = (productId: string) => {
    const product = products?.items.find((p) => p.id === productId);
    return product ? `${product.sku} — ${product.name}` : productId;
  };
  const productTracksBatches = (productId: string) => products?.items.find((p) => p.id === productId)?.trackBatches ?? false;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.detail("purchases", id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.list("purchases") });
    queryClient.invalidateQueries({ queryKey: queryKeys.list("inventory-balance") });
  };

  const confirmMutation = useMutation({
    mutationFn: () => apiClient.post<PurchaseView>(`/purchases/${id}/confirm`),
    onSuccess: () => {
      invalidate();
      toast.success("Purchase confirmed");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiClient.post<PurchaseView>(`/purchases/${id}/cancel`),
    onSuccess: () => {
      invalidate();
      toast.success("Purchase cancelled");
    },
  });

  const handleConfirm = async () => {
    try {
      await confirmMutation.mutateAsync();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  if (isLoading || !purchase) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const canConfirm = purchase.status === "DRAFT" && can("PURCHASE.UPDATE");
  const canReceive = RECEIVABLE_STATUSES.has(purchase.status) && can("PURCHASE.RECEIVE");
  const canCancel = CANCELLABLE_STATUSES.has(purchase.status) && can("PURCHASE.UPDATE");

  return (
    <div className="space-y-6">
      <Link href="/store/purchases" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to purchases
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Purchase #{purchase.id}</h1>
          <p className="text-muted-foreground">{suppliers?.find((s) => s.id === purchase.supplierId)?.name ?? purchase.supplierId}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{purchase.status}</Badge>
          {canConfirm && (
            <Button onClick={() => void handleConfirm()} disabled={confirmMutation.isPending}>
              Confirm
            </Button>
          )}
          {canReceive && <Button onClick={() => setReceiveOpen(true)}>Receive</Button>}
          {canCancel && (
            <Button variant="outline" onClick={() => setConfirmingCancel(true)}>
              Cancel purchase
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
                <TableHead>Ordered</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchase.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{productLabel(item.productId)}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.receivedQuantity}</TableCell>
                  <TableCell>{item.price}</TableCell>
                  <TableCell>
                    {item.taxes.length === 0 ? (
                      item.tax
                    ) : (
                      <div className="space-y-0.5">
                        {item.taxes.map((tax, index) => (
                          <div key={index} className="text-xs whitespace-nowrap">
                            {tax.component} {tax.ratePercent}%: {tax.amount}
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {purchase.charges.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Charges</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Tax</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchase.charges.map((charge) => (
                  <TableRow key={charge.id}>
                    <TableCell>{charge.name}</TableCell>
                    <TableCell>{charge.amount}</TableCell>
                    <TableCell>{charge.taxAmount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Total</CardTitle>
        </CardHeader>
        <CardContent>
          <PurchaseTotals purchase={purchase} />
        </CardContent>
      </Card>

      {confirmingCancel && (
        <ConfirmDialog
          open={confirmingCancel}
          onOpenChange={setConfirmingCancel}
          title="Cancel this purchase?"
          description="This cannot be undone."
          confirmLabel="Cancel purchase"
          destructive
          onConfirm={async () => {
            await cancelMutation.mutateAsync();
          }}
        />
      )}

      {receiveOpen && (
        <ReceiveDialog
          open={receiveOpen}
          onOpenChange={setReceiveOpen}
          purchase={purchase}
          productLabel={productLabel}
          productTracksBatches={productTracksBatches}
          onReceived={invalidate}
        />
      )}
    </div>
  );
}

function PurchaseTotals({ purchase }: { purchase: PurchaseView }) {
  const subtotal = purchase.items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  const taxTotal = purchase.items.reduce((sum, item) => sum + Number(item.tax), 0);
  const chargesTotal = purchase.charges.reduce((sum, charge) => sum + Number(charge.amount), 0);
  const chargesTaxTotal = purchase.charges.reduce((sum, charge) => sum + Number(charge.taxAmount), 0);
  const grandTotal = subtotal + taxTotal + chargesTotal + chargesTaxTotal;

  const rows: [string, number][] = [
    ["Subtotal", subtotal],
    ["Tax", taxTotal],
    ...(chargesTotal > 0
      ? ([
          ["Charges", chargesTotal],
          ["Charges tax", chargesTaxTotal],
        ] as [string, number][])
      : []),
  ];

  return (
    <div className="max-w-xs space-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between">
          <span className="text-muted-foreground">{label}</span>
          <span>{value.toFixed(2)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t pt-1 font-medium">
        <span>Grand total</span>
        <span>{grandTotal.toFixed(2)}</span>
      </div>
    </div>
  );
}

type BatchRow = { batchNumber: string; expiryDate: string; quantity: string };

// Batch-tracked products need a batch-number/expiry/quantity breakdown per
// line instead of a single quantity — see
// Docs/batch_expiry_tracking_plan.md §8/§12. A non-tracked product's line
// is completely unaffected (still just one quantity field).
function ReceiveDialog({
  open,
  onOpenChange,
  purchase,
  productLabel,
  productTracksBatches,
  onReceived,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: PurchaseView;
  productLabel: (productId: string) => string;
  productTracksBatches: (productId: string) => boolean;
  onReceived: () => void;
}) {
  const outstandingItems = purchase.items.filter(
    (item) => Number(item.quantity) - Number(item.receivedQuantity) > 0,
  );

  const form = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(
      outstandingItems.filter((item) => !productTracksBatches(item.productId)).map((item) => [item.id, ""]),
    ),
  });
  const [batchesByItemId, setBatchesByItemId] = useState<Record<string, BatchRow[]>>({});

  useEffect(() => {
    form.reset(
      Object.fromEntries(
        outstandingItems.filter((item) => !productTracksBatches(item.productId)).map((item) => [item.id, ""]),
      ),
    );
    setBatchesByItemId(
      Object.fromEntries(
        outstandingItems
          .filter((item) => productTracksBatches(item.productId))
          .map((item) => [item.id, [{ batchNumber: "", expiryDate: "", quantity: "" }]]),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const receiveMutation = useMutation({
    mutationFn: (
      items: { purchaseItemId: string; receivedQuantity: string; batches?: { batchNumber: string; expiryDate?: string; quantity: string }[] }[],
    ) => apiClient.post<PurchaseView>(`/purchases/${purchase.id}/receive`, { items }),
    onSuccess: () => {
      onReceived();
      toast.success("Purchase received");
      onOpenChange(false);
    },
  });

  const updateBatchRow = (itemId: string, index: number, patch: Partial<BatchRow>) => {
    setBatchesByItemId((current) => ({
      ...current,
      [itemId]: current[itemId].map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  };
  const addBatchRow = (itemId: string) => {
    setBatchesByItemId((current) => ({
      ...current,
      [itemId]: [...current[itemId], { batchNumber: "", expiryDate: "", quantity: "" }],
    }));
  };
  const removeBatchRow = (itemId: string, index: number) => {
    setBatchesByItemId((current) => ({
      ...current,
      [itemId]: current[itemId].filter((_, i) => i !== index),
    }));
  };

  const onSubmit = async (values: Record<string, string>) => {
    const plainItems = Object.entries(values)
      .filter(([, quantity]) => quantity && Number(quantity) > 0)
      .map(([purchaseItemId, receivedQuantity]) => ({ purchaseItemId, receivedQuantity }));

    const batchItems = [];
    for (const [itemId, rows] of Object.entries(batchesByItemId)) {
      const validRows = rows.filter((row) => row.batchNumber.trim() && Number(row.quantity) > 0);
      if (validRows.length === 0) continue;
      const receivedQuantity = validRows
        .reduce((sum, row) => sum + Number(row.quantity), 0)
        .toString();
      batchItems.push({
        purchaseItemId: itemId,
        receivedQuantity,
        batches: validRows.map((row) => ({
          batchNumber: row.batchNumber.trim(),
          expiryDate: row.expiryDate || undefined,
          quantity: row.quantity,
        })),
      });
    }

    const items = [...plainItems, ...batchItems];
    if (items.length === 0) {
      toast.error("Enter a quantity for at least one line.");
      return;
    }

    try {
      await receiveMutation.mutateAsync(items);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Receive stock</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="max-h-[70vh] space-y-4 overflow-y-auto">
          <div className="space-y-3">
            {outstandingItems.map((item) => {
              const remaining = (Number(item.quantity) - Number(item.receivedQuantity)).toString();
              if (!productTracksBatches(item.productId)) {
                return (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{productLabel(item.productId)}</p>
                      <p className="text-xs text-muted-foreground">{remaining} remaining</p>
                    </div>
                    <Input className="w-28" placeholder="0" {...form.register(item.id)} />
                  </div>
                );
              }

              const rows = batchesByItemId[item.id] ?? [];
              const total = rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
              return (
                <div key={item.id} className="space-y-2 rounded-md border p-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{productLabel(item.productId)}</p>
                    <p className="text-xs text-muted-foreground">
                      {remaining} remaining · {total} entered
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {rows.map((row, index) => (
                      <div key={index} className="flex items-center gap-1.5">
                        <Input
                          className="flex-1"
                          placeholder="Batch number"
                          value={row.batchNumber}
                          onChange={(e) => updateBatchRow(item.id, index, { batchNumber: e.target.value })}
                        />
                        <Input
                          className="w-36"
                          type="date"
                          value={row.expiryDate}
                          onChange={(e) => updateBatchRow(item.id, index, { expiryDate: e.target.value })}
                        />
                        <Input
                          className="w-20"
                          placeholder="Qty"
                          value={row.quantity}
                          onChange={(e) => updateBatchRow(item.id, index, { quantity: e.target.value })}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeBatchRow(item.id, index)}
                          disabled={rows.length === 1}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => addBatchRow(item.id)}>
                      <Plus className="size-3.5" /> Add batch
                    </Button>
                  </div>
                </div>
              );
            })}
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
