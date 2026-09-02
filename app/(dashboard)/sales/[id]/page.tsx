"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/resource/confirm-dialog";
import { LoaderButton } from "@/components/ui/loader-button";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import type { SaleView } from "@/modules/sales/types/sale.types";
import type { CustomerView } from "@/modules/customer/types/customer.types";
import type { WarehouseView } from "@/modules/warehouse/types/warehouse.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

// The richest lifecycle in the app — see
// modules/sales/service/sale.service.ts. A POS sale goes DRAFT ->
// CONFIRMED -> COMPLETED; every other channel goes PENDING_PAYMENT ->
// CONFIRMED -> PROCESSING -> PACKED -> SHIPPED -> DELIVERED. Every button
// below is gated by BOTH the sale's current status/channel AND the
// caller's permission, mirroring the two-layer check the API itself
// enforces server-side.
const CANCELLABLE_STATUSES = new Set(["DRAFT", "PENDING_PAYMENT", "CONFIRMED", "PROCESSING", "PACKED"]);

type SaleAction = "confirm" | "process" | "pack" | "ship" | "deliver" | "complete" | "cancel";

export default function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [confirmAction, setConfirmAction] = useState<SaleAction | null>(null);

  const { data: sale, isLoading } = useQuery({
    queryKey: queryKeys.detail("sales", id),
    queryFn: () => apiClient.get<SaleView>(`/sales/${id}`),
  });
  const { data: customersPage } = useQuery({
    queryKey: queryKeys.list("customers", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<CustomerView>>("/customers", { page: 1, pageSize: 100 }),
  });
  const customers = customersPage?.items;
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

  const actionMutation = useMutation({
    mutationFn: ({ action, body }: { action: SaleAction; body?: unknown }) =>
      apiClient.post<SaleView>(`/sales/${id}/${action}`, body),
    onSuccess: (_data, { action }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.detail("sales", id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.list("sales") });
      queryClient.invalidateQueries({ queryKey: queryKeys.list("inventory-balance") });
      toast.success(`Sale ${action}ed`.replace("completeed", "completed"));
    },
  });

  const runAction = async (action: SaleAction) => {
    try {
      await actionMutation.mutateAsync({ action });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  if (isLoading || !sale) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const isPos = sale.channel === "POS";
  const canConfirm = !isPos && (sale.status === "DRAFT" || sale.status === "PENDING_PAYMENT") && can("SALE.CONFIRM");
  const canProcess = !isPos && sale.status === "CONFIRMED" && can("SALE.PROCESS");
  const canPack = !isPos && sale.status === "PROCESSING" && can("SALE.PACK");
  const canShip = !isPos && sale.status === "PACKED" && can("SALE.SHIP");
  const canDeliver = !isPos && sale.status === "SHIPPED" && can("SALE.DELIVER");
  const canComplete = isPos && sale.status !== "COMPLETED" && sale.status !== "CANCELLED" && can("SALE.COMPLETE");
  const canCancel = CANCELLABLE_STATUSES.has(sale.status) && can("SALE.CANCEL");

  return (
    <div className="space-y-6">
      <Link href="/sales" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to sales
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Sale #{sale.id}</h1>
          <p className="text-muted-foreground">
            {sale.customerId ? (customers?.find((c) => c.id === sale.customerId)?.name ?? sale.customerId) : "No Customer"} —{" "}
            {warehouses?.find((w) => w.id === sale.warehouseId)?.name ?? sale.warehouseId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{sale.channel}</Badge>
          <Badge>{sale.status}</Badge>
          {sale.assignedDeliveryUserName && (
            <span className="text-sm text-muted-foreground">Assigned to {sale.assignedDeliveryUserName}</span>
          )}
          {canConfirm && <Button onClick={() => setConfirmAction("confirm")}>Confirm</Button>}
          {canProcess && <Button onClick={() => setConfirmAction("process")}>Process</Button>}
          {canPack && <Button onClick={() => setConfirmAction("pack")}>Pack</Button>}
          {canShip && <Button onClick={() => setConfirmAction("ship")}>Ship</Button>}
          {canDeliver && <Button onClick={() => setConfirmAction("deliver")}>Deliver</Button>}
          {canComplete && <Button onClick={() => setConfirmAction("complete")}>Complete</Button>}
          {canCancel && (
            <Button variant="outline" onClick={() => setConfirmAction("cancel")}>
              Cancel sale
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
                <TableHead>Quantity</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sale.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{productLabel(item.productId)}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
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

      {sale.discounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Discounts &amp; coupons applied</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applies to</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.discounts.map((discount) => {
                  const lineItem = sale.items.find((item) => item.id === discount.saleItemId);
                  return (
                    <TableRow key={discount.id}>
                      <TableCell>{lineItem ? productLabel(lineItem.productId) : "Whole order"}</TableCell>
                      <TableCell>{discount.couponId ? `Coupon #${discount.couponId}` : `Discount #${discount.discountId}`}</TableCell>
                      <TableCell>-{discount.amount}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {sale.charges.length > 0 && (
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
                {sale.charges.map((charge) => (
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
          <SaleTotals sale={sale} />
        </CardContent>
      </Card>

      {confirmAction === "ship" && (
        <ShipDialog
          open
          onOpenChange={(open) => !open && setConfirmAction(null)}
          onSubmit={(assignedDeliveryUserId) =>
            actionMutation.mutateAsync({ action: "ship", body: { assignedDeliveryUserId } })
          }
        />
      )}

      {confirmAction && confirmAction !== "ship" && (
        <ConfirmDialog
          open={Boolean(confirmAction)}
          onOpenChange={(open) => !open && setConfirmAction(null)}
          title={`${confirmAction === "cancel" ? "Cancel" : confirmAction[0].toUpperCase() + confirmAction.slice(1)} this sale?`}
          description={
            confirmAction === "cancel"
              ? "If stock already left for this sale, it will be credited back."
              : undefined
          }
          confirmLabel={confirmAction === "cancel" ? "Cancel sale" : "Confirm"}
          destructive={confirmAction === "cancel"}
          onConfirm={() => runAction(confirmAction)}
        />
      )}
    </div>
  );
}

// Ship is the one lifecycle action that needs input (who's taking the
// package), unlike every other action's plain ConfirmDialog — see
// modules/sales/service/sale.service.ts's ship().
function ShipDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (assignedDeliveryUserId: string) => Promise<unknown>;
}) {
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: assignees, isLoading } = useQuery({
    queryKey: queryKeys.list("sales-delivery-assignees"),
    queryFn: () => apiClient.get<{ id: string; name: string }[]>("/sales/delivery-assignees"),
    enabled: open,
  });

  const handleSubmit = async () => {
    if (!assigneeId) return;
    setIsSubmitting(true);
    try {
      await onSubmit(assigneeId);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ship this sale?</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Assign to</Label>
          <Select value={assigneeId} onValueChange={(value) => setAssigneeId(value ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={isLoading ? "Loading…" : "Select a delivery person"} />
            </SelectTrigger>
            <SelectContent>
              {(assignees ?? []).map((assignee) => (
                <SelectItem key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {assignees?.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No users hold the delivery permission yet — grant SALE.DELIVER to a role first.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <LoaderButton onClick={handleSubmit} disabled={!assigneeId} loading={isSubmitting}>
            Ship
          </LoaderButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Subtotal -> Discount -> Taxable Value -> Tax -> Charges (+ their tax) ->
// Grand Total — see Docs/business-rules/discounts-and-coupons.md's order
// of operations, which this display mirrors exactly.
function SaleTotals({ sale }: { sale: SaleView }) {
  const subtotal = sale.items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  const discountTotal = sale.discounts.reduce((sum, discount) => sum + Number(discount.amount), 0);
  const taxTotal = sale.items.reduce((sum, item) => sum + Number(item.tax), 0);
  const chargesTotal = sale.charges.reduce((sum, charge) => sum + Number(charge.amount), 0);
  const chargesTaxTotal = sale.charges.reduce((sum, charge) => sum + Number(charge.taxAmount), 0);

  const isInclusive = sale.taxInclusive !== false;
  const netSubtotal = subtotal - discountTotal;
  const taxableValue = isInclusive ? netSubtotal - taxTotal : netSubtotal;
  const grandTotal = isInclusive
    ? netSubtotal + chargesTotal + chargesTaxTotal
    : netSubtotal + taxTotal + chargesTotal + chargesTaxTotal;

  const rows: [string, number][] = [
    ["Subtotal", subtotal],
    ...(discountTotal > 0 ? ([["Discount", -discountTotal]] as [string, number][]) : []),
    ["Taxable value (excl. tax)", taxableValue],
    [isInclusive ? "Tax (included)" : "Tax", taxTotal],
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
