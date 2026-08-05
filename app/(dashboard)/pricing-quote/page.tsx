"use client";

import { useState } from "react";
import { useForm, Controller, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineItemsField } from "@/components/resource/line-items-field";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { quoteSchema } from "@/modules/pricing/schema/promotion.schema";
import type { QuoteView } from "@/modules/pricing/types/promotion.types";
import type { WarehouseView } from "@/modules/warehouse/types/warehouse.types";
import type { CustomerView } from "@/modules/customer/types/customer.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

const NONE = "__none__";

// A pure preview of modules/pricing/service/promotion.service.ts's quote()
// — no writes, no coupon redemption — lets a staff member check what
// discounts/coupons would apply to a cart before actually creating the
// sale. See app/api/v1/pricing/quote/route.ts.
export default function PricingQuotePage() {
  const [result, setResult] = useState<QuoteView | null>(null);

  const { data: warehouses } = useQuery({
    queryKey: queryKeys.list("warehouses"),
    queryFn: () => apiClient.get<WarehouseView[]>("/warehouses"),
  });
  const { data: customers } = useQuery({
    queryKey: queryKeys.list("customers"),
    queryFn: () => apiClient.get<CustomerView[]>("/customers"),
  });
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });

  const productOptions = (products?.items ?? []).map((p) => ({ label: `${p.sku} — ${p.name}`, value: p.id }));
  const productLabel = (productId: string) => {
    const product = products?.items.find((p) => p.id === productId);
    return product ? `${product.sku} — ${product.name}` : productId;
  };

  const defaultFormValues = {
    warehouseId: "",
    customerId: NONE,
    couponCode: "",
    lines: [{ productId: "", quantity: "", unitPrice: "" }],
  };

  const form = useForm<FieldValues>({
    resolver: zodResolver(quoteSchema as never),
    defaultValues: defaultFormValues,
  });

  const quoteMutation = useMutation({
    mutationFn: (values: FieldValues) => apiClient.post<QuoteView>("/pricing/quote", values),
  });

  const onSubmit = async (values: FieldValues) => {
    try {
      const payload = { ...values, customerId: values.customerId === NONE ? undefined : values.customerId, couponCode: values.couponCode || undefined };
      const quote = await quoteMutation.mutateAsync(payload);
      setResult(quote);
    } catch (error) {
      setResult(null);
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold font-heading">Quote Simulator</h1>
        <p className="text-muted-foreground">Preview which discounts/coupons apply to a cart before creating a sale.</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Cart</CardTitle>
          <CardDescription>No sale is created — this only previews the promotion engine&apos;s result.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Warehouse</Label>
                <Controller
                  control={form.control}
                  name="warehouseId"
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
              <div className="space-y-1.5">
                <Label>Customer (optional)</Label>
                <Controller
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="No customer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No customer</SelectItem>
                        {(customers ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="couponCode">Coupon code (optional)</Label>
              <Input id="couponCode" placeholder="WELCOME20" {...form.register("couponCode")} />
            </div>

            <LineItemsField
              control={form.control}
              name="lines"
              productOptions={productOptions}
              columns={[
                { name: "quantity", label: "Quantity" },
                { name: "unitPrice", label: "Unit price" },
              ]}
              emptyItem={{ productId: "", quantity: "", unitPrice: "" }}
            />

            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Calculating…" : "Get quote"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Subtotal</TableHead>
                  <TableHead>Discounts</TableHead>
                  <TableHead>Line total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.lines.map((line, index) => (
                  <TableRow key={index}>
                    <TableCell>{productLabel(line.productId)}</TableCell>
                    <TableCell>{line.quantity}</TableCell>
                    <TableCell>{line.lineSubtotal}</TableCell>
                    <TableCell>
                      {line.discounts.length === 0
                        ? "—"
                        : line.discounts.map((d) => `${d.name} (-${d.amount})`).join(", ")}
                    </TableCell>
                    <TableCell>{line.lineTotal}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="space-y-1 text-sm">
              <p>
                Subtotal: <span className="font-medium">{result.subtotal}</span>
              </p>
              <p>
                Line discounts: <span className="font-medium">-{result.lineDiscountTotal}</span>
              </p>
              {result.coupon && (
                <p>
                  Coupon {result.coupon.code}: <span className="font-medium">-{result.coupon.amount}</span>
                </p>
              )}
              <p className="text-base">
                Grand total: <span className="font-semibold">{result.grandTotal}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
