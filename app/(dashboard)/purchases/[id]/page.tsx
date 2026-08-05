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
import type { PurchaseView } from "@/modules/purchase/types/purchase.types";
import type { SupplierView } from "@/modules/supplier/types/supplier.types";
import type { WarehouseView } from "@/modules/warehouse/types/warehouse.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

const RECEIVABLE_STATUSES = new Set(["ORDERED", "PARTIALLY_RECEIVED"]);
const CANCELLABLE_STATUSES = new Set(["DRAFT", "ORDERED"]);

export default function PurchaseDetailPage() {
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
  const { data: warehouses } = useQuery({
    queryKey: queryKeys.list("warehouses"),
    queryFn: () => apiClient.get<WarehouseView[]>("/warehouses"),
  });
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });

  const productLabel = (productId: string) => {
    const product = products?.items.find((p) => p.id === productId);
    return product ? `${product.sku} — ${product.name}` : productId;
  };

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
      <Link href="/purchases" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to purchases
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Purchase #{purchase.id}</h1>
          <p className="text-muted-foreground">
            {suppliers?.find((s) => s.id === purchase.supplierId)?.name ?? purchase.supplierId} —{" "}
            {warehouses?.find((w) => w.id === purchase.warehouseId)?.name ?? purchase.warehouseId}
          </p>
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
          onReceived={invalidate}
        />
      )}
    </div>
  );
}

// Subtotal -> Tax -> Charges (+ their tax) -> Grand Total. Purchases have
// no discount engine (see Docs/business-rules/pricing.md), so there's no
// discount/taxable-value split to show, unlike the Sale detail page.
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

// Receiving is quantity-aware, not a plain status flip — each line can be
// received partially, and only the still-outstanding amount is editable
// (see modules/purchase/service/purchase.service.ts's RECEIVABLE_STATUSES
// and per-line remaining-quantity check). Purpose-built rather than reusing
// LineItemsField, since the product/line set here is fixed by the existing
// purchase, not user-added.
function ReceiveDialog({
  open,
  onOpenChange,
  purchase,
  productLabel,
  onReceived,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: PurchaseView;
  productLabel: (productId: string) => string;
  onReceived: () => void;
}) {
  const outstandingItems = purchase.items.filter(
    (item) => Number(item.quantity) - Number(item.receivedQuantity) > 0,
  );

  const form = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(outstandingItems.map((item) => [item.id, ""])),
  });

  useEffect(() => {
    form.reset(Object.fromEntries(outstandingItems.map((item) => [item.id, ""])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const receiveMutation = useMutation({
    mutationFn: (items: { purchaseItemId: string; receivedQuantity: string }[]) =>
      apiClient.post<PurchaseView>(`/purchases/${purchase.id}/receive`, { items }),
    onSuccess: () => {
      onReceived();
      toast.success("Purchase received");
      onOpenChange(false);
    },
  });

  const onSubmit = async (values: Record<string, string>) => {
    const items = Object.entries(values)
      .filter(([, quantity]) => quantity && Number(quantity) > 0)
      .map(([purchaseItemId, receivedQuantity]) => ({ purchaseItemId, receivedQuantity }));

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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Receive stock</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-3">
            {outstandingItems.map((item) => {
              const remaining = (Number(item.quantity) - Number(item.receivedQuantity)).toString();
              return (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{productLabel(item.productId)}</p>
                    <p className="text-xs text-muted-foreground">{remaining} remaining</p>
                  </div>
                  <Input className="w-28" placeholder="0" {...form.register(item.id)} />
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
