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
import { Checkbox } from "@/components/ui/checkbox";
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
import type { ExtraChargeView } from "@/modules/extra-charge/types/extra-charge.types";
import type { Paginated } from "@/shared/utils/pagination";

const NONE = "__none__";

const CHANNEL_OPTIONS = [
  { label: "No channel", value: NONE },
  { label: "POS", value: "POS" },
  { label: "Online", value: "ONLINE" },
  { label: "Marketplace", value: "MARKETPLACE" },
  { label: "Phone", value: "PHONE" },
];

// A pure preview of modules/pricing/service/promotion.service.ts's quote()
// — no writes, no coupon redemption — lets a staff member check the full
// invoice breakdown (discounts, coupon, extra charges, tax) before actually
// creating the sale. See app/api/v1/pricing/quote/route.ts.
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
  const { data: extraCharges } = useQuery({
    queryKey: queryKeys.list("extra-charges"),
    queryFn: () => apiClient.get<ExtraChargeView[]>("/extra-charges"),
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
    channel: NONE,
    extraChargeIds: [] as string[],
    taxInclusive: false,
    lines: [{ productId: "", quantity: "", unitPrice: "" }],
  };

  const form = useForm<FieldValues>({
    resolver: zodResolver(quoteSchema as never),
    defaultValues: defaultFormValues,
  });

  const watchedChannel = form.watch("channel");

  const quoteMutation = useMutation({
    mutationFn: (values: FieldValues) => apiClient.post<QuoteView>("/pricing/quote", values),
  });

  const onSubmit = async (values: FieldValues) => {
    try {
      const payload = {
        ...values,
        couponCode: values.couponCode || undefined,
        channel: values.channel === NONE ? undefined : values.channel,
      };
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
        <p className="text-muted-foreground">
          Preview the full invoice breakdown — discounts, coupon, extra charges, and tax — before creating a sale.
        </p>
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
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(value) => field.onChange(value === NONE ? undefined : value)}
                    >
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="couponCode">Coupon code (optional)</Label>
                <Input id="couponCode" placeholder="WELCOME20" {...form.register("couponCode")} />
              </div>
              <div className="space-y-1.5">
                <Label>Channel (optional)</Label>
                <Controller
                  control={form.control}
                  name="channel"
                  render={({ field }) => (
                    <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHANNEL_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <Controller
              control={form.control}
              name="taxInclusive"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} />
                  Prices already include tax
                </label>
              )}
            />

            {extraCharges && extraCharges.length > 0 && (
              <div className="space-y-1.5">
                <Label>Extra charges (optional)</Label>
                <Controller
                  control={form.control}
                  name="extraChargeIds"
                  render={({ field }) => {
                    const applicable = extraCharges.filter(
                      (charge) =>
                        !charge.applicableChannels ||
                        charge.applicableChannels.length === 0 ||
                        watchedChannel === NONE ||
                        !watchedChannel ||
                        charge.applicableChannels.includes(watchedChannel),
                    );
                    const selected: string[] = field.value ?? [];
                    return (
                      <div className="grid grid-cols-2 gap-1.5 rounded-md border p-3">
                        {applicable.map((charge) => (
                          <label key={charge.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={selected.includes(charge.id)}
                              onCheckedChange={(checked) => {
                                field.onChange(
                                  checked ? [...selected, charge.id] : selected.filter((id) => id !== charge.id),
                                );
                              }}
                            />
                            {charge.name} ({charge.calcType === "FLAT" ? charge.value : `${charge.value}%`})
                          </label>
                        ))}
                      </div>
                    );
                  }}
                />
              </div>
            )}

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
            <CardDescription>
              {result.taxInclusive
                ? "Prices already include tax — the breakdown below shows how much of the total is tax, not an amount added on top."
                : "Tax is added on top of the discounted subtotal."}
            </CardDescription>
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
                  <TableHead>Tax</TableHead>
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
                    <TableCell>
                      {Number(line.tax) === 0
                        ? "—"
                        : `${line.tax} (${line.taxes.map((t) => `${t.component} ${t.ratePercent}%`).join(" + ")})`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {result.charges.length > 0 && (
              <div className="space-y-1 text-sm">
                <p className="font-medium">Extra charges</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Charge</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Tax</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.charges.map((charge, index) => (
                      <TableRow key={index}>
                        <TableCell>{charge.name}</TableCell>
                        <TableCell>{charge.amount}</TableCell>
                        <TableCell>{charge.taxAmount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

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
              {result.charges.length > 0 && (
                <p>
                  Extra charges: <span className="font-medium">{result.chargesTotal}</span>
                </p>
              )}
              <p>
                Tax {result.taxInclusive ? "(included)" : "(added)"}:{" "}
                <span className="font-medium">{result.taxTotal}</span>
              </p>
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
