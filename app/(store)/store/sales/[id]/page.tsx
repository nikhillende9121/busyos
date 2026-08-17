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
import { ConfirmDialog } from "@/components/resource/confirm-dialog";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import type { SaleView } from "@/modules/sales/types/sale.types";
import type { CustomerView } from "@/modules/customer/types/customer.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

// Trimmed copy of app/(dashboard)/sales/[id]/page.tsx — same lifecycle,
// same permission gating, just no warehouse name in the header (there's
// only ever the caller's own store). See Docs/STORE_APP_GUIDE.md.
const CANCELLABLE_STATUSES = new Set(["DRAFT", "PENDING_PAYMENT", "CONFIRMED", "PROCESSING", "PACKED"]);

type SaleAction = "confirm" | "process" | "pack" | "ship" | "deliver" | "complete" | "cancel";

export default function StoreSaleDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [confirmAction, setConfirmAction] = useState<SaleAction | null>(null);

  const { data: sale, isLoading } = useQuery({
    queryKey: queryKeys.detail("sales", id),
    queryFn: () => apiClient.get<SaleView>(`/sales/${id}`),
  });
  const { data: customers } = useQuery({
    queryKey: queryKeys.list("customers"),
    queryFn: () => apiClient.get<CustomerView[]>("/customers"),
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
    mutationFn: (action: SaleAction) => apiClient.post<SaleView>(`/sales/${id}/${action}`),
    onSuccess: (_data, action) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.detail("sales", id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.list("sales") });
      queryClient.invalidateQueries({ queryKey: queryKeys.list("inventory-balance") });
      toast.success(`Sale ${action}ed`.replace("completeed", "completed"));
    },
  });

  const runAction = async (action: SaleAction) => {
    try {
      await actionMutation.mutateAsync(action);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  if (isLoading || !sale) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const isPos = sale.channel === "POS";
  const initialStatus = isPos ? "DRAFT" : "PENDING_PAYMENT";

  const canConfirm = sale.status === initialStatus && can("SALE.CONFIRM");
  const canProcess = !isPos && sale.status === "CONFIRMED" && can("SALE.UPDATE");
  const canPack = !isPos && sale.status === "PROCESSING" && can("SALE.UPDATE");
  const canShip = !isPos && sale.status === "PACKED" && can("SALE.UPDATE");
  const canDeliver = !isPos && sale.status === "SHIPPED" && can("SALE.UPDATE");
  const canComplete = isPos && sale.status === "CONFIRMED" && can("SALE.UPDATE");
  const canCancel = CANCELLABLE_STATUSES.has(sale.status) && can("SALE.UPDATE");

  return (
    <div className="space-y-6">
      <Link href="/store/sales" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to sales
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Sale #{sale.id}</h1>
          <p className="text-muted-foreground">{customers?.find((c) => c.id === sale.customerId)?.name ?? sale.customerId}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{sale.channel}</Badge>
          <Badge>{sale.status}</Badge>
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

      {confirmAction && (
        <ConfirmDialog
          open={Boolean(confirmAction)}
          onOpenChange={(open) => !open && setConfirmAction(null)}
          title={`${confirmAction === "cancel" ? "Cancel" : confirmAction[0].toUpperCase() + confirmAction.slice(1)} this sale?`}
          description={
            confirmAction === "cancel" ? "If stock already left for this sale, it will be credited back." : undefined
          }
          confirmLabel={confirmAction === "cancel" ? "Cancel sale" : "Confirm"}
          destructive={confirmAction === "cancel"}
          onConfirm={() => runAction(confirmAction)}
        />
      )}
    </div>
  );
}

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
