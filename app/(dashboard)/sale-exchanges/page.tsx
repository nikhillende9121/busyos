"use client";

import { useEffect, useState } from "react";
import { useForm, Controller, type FieldValues } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { LineItemsField } from "@/components/resource/line-items-field";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import type { SaleExchangeView } from "@/modules/sales/types/sale-exchange.types";
import type { SaleView } from "@/modules/sales/types/sale.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { ExtraChargeView } from "@/modules/extra-charge/types/extra-charge.types";
import type { Paginated } from "@/shared/utils/pagination";

// Only a sale whose stock actually left is exchangeable — same rule a
// standalone return uses, see modules/sales/service/sale-return.service.ts.
const RETURNABLE_STATUSES = new Set(["CONFIRMED", "COMPLETED"]);

const PAYMENT_METHOD_OPTIONS = [
  { label: "Cash", value: "CASH" },
  { label: "Card", value: "CARD" },
  { label: "Bank Transfer", value: "BANK_TRANSFER" },
  { label: "UPI", value: "UPI" },
  { label: "Cheque", value: "CHEQUE" },
  { label: "Credit", value: "CREDIT" },
];

const DIRECTION_LABEL: Record<string, string> = {
  CUSTOMER_OWES: "Customer owes",
  REFUND_DUE: "Refund due",
  EVEN: "Even",
};

export default function SaleExchangesPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: exchanges, isLoading } = useQuery({
    queryKey: queryKeys.list("sale-exchanges"),
    queryFn: () => apiClient.get<SaleExchangeView[]>("/sale-exchanges"),
  });
  const { data: sales } = useQuery({
    queryKey: queryKeys.list("sales"),
    queryFn: () => apiClient.get<SaleView[]>("/sales"),
  });
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });
  const { data: extraCharges } = useQuery({
    queryKey: queryKeys.list("extra-charges"),
    queryFn: () => apiClient.get<ExtraChargeView[]>("/extra-charges"),
  });

  const productLabel = (productId: string) => {
    const product = products?.items.find((p) => p.id === productId);
    return product ? `${product.sku} — ${product.name}` : productId;
  };
  const productOptions = (products?.items ?? []).map((p) => ({ label: `${p.sku} — ${p.name}`, value: p.id }));

  const columns: DataTableColumn<SaleExchangeView>[] = [
    { key: "id", header: "ID", render: (row) => `#${row.id}` },
    { key: "saleId", header: "Original sale", render: (row) => `#${row.saleReturn.saleId}` },
    { key: "newSaleId", header: "Replacement sale", render: (row) => `#${row.newSale.id}` },
    {
      key: "difference",
      header: "Settlement",
      render: (row) =>
        row.differenceDirection === "EVEN"
          ? "Even"
          : `${DIRECTION_LABEL[row.differenceDirection]} — ${row.differenceAmount}`,
    },
    { key: "createdAt", header: "Created", render: (row) => new Date(row.createdAt).toLocaleString() },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Sale Exchanges</h1>
          <p className="text-muted-foreground">
            Return item(s) from a past sale and sell replacement item(s) in the same transaction — the
            difference is collected or refunded on the spot.
          </p>
        </div>
        {can("SALE.EXCHANGE") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New exchange
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={exchanges ?? []}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        emptyMessage="No sale exchanges yet."
      />

      {createOpen && (
        <CreateSaleExchangeDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          sales={(sales ?? []).filter((s) => RETURNABLE_STATUSES.has(s.status))}
          productLabel={productLabel}
          productOptions={productOptions}
          extraCharges={extraCharges ?? []}
          onCreated={() => queryClient.invalidateQueries({ queryKey: queryKeys.list("sale-exchanges") })}
        />
      )}
    </div>
  );
}

function CreateSaleExchangeDialog({
  open,
  onOpenChange,
  sales,
  productLabel,
  productOptions,
  extraCharges,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sales: SaleView[];
  productLabel: (productId: string) => string;
  productOptions: { label: string; value: string }[];
  extraCharges: ExtraChargeView[];
  onCreated: () => void;
}) {
  const [saleId, setSaleId] = useState<string>("");
  const selectedSale = sales.find((s) => s.id === saleId) ?? null;

  const defaultValues: FieldValues = {
    reason: "",
    couponCode: "",
    extraChargeIds: [] as string[],
    paymentMethod: "CASH",
    newItems: [{ productId: "", quantity: "", price: "" }],
  };

  const form = useForm<FieldValues>({ defaultValues });

  useEffect(() => {
    form.reset({
      ...defaultValues,
      ...Object.fromEntries((selectedSale?.items ?? []).map((item) => [`return_${item.id}`, ""])),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId]);

  const createMutation = useMutation({
    mutationFn: (values: {
      saleId: string;
      reason: string;
      returnItems: { saleItemId: string; quantity: string }[];
      newItems: { productId: string; quantity: string; price: string }[];
      couponCode?: string;
      extraChargeIds?: string[];
      paymentMethod: string;
    }) => apiClient.post<SaleExchangeView>("/sale-exchanges", values),
    onSuccess: (exchange) => {
      onCreated();
      toast.success(
        exchange.differenceDirection === "EVEN"
          ? "Exchange recorded — settled even."
          : `Exchange recorded — ${DIRECTION_LABEL[exchange.differenceDirection]} ${exchange.differenceAmount}.`,
      );
      onOpenChange(false);
      setSaleId("");
    },
  });

  const onSubmit = async (values: FieldValues) => {
    if (!selectedSale) {
      toast.error("Select a sale first.");
      return;
    }

    const returnItems = Object.entries(values)
      .filter(([key, quantity]) => key.startsWith("return_") && quantity && Number(quantity) > 0)
      .map(([key, quantity]) => ({ saleItemId: key.replace("return_", ""), quantity: quantity as string }));
    if (returnItems.length === 0) {
      toast.error("Enter a quantity for at least one returned line.");
      return;
    }

    const newItems = (values.newItems ?? []).filter(
      (item: { productId: string; quantity: string; price: string }) => item.productId && item.quantity,
    );
    if (newItems.length === 0) {
      toast.error("Add at least one replacement product.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        saleId: selectedSale.id,
        reason: values.reason,
        returnItems,
        newItems,
        couponCode: values.couponCode || undefined,
        extraChargeIds: values.extraChargeIds,
        paymentMethod: values.paymentMethod,
      });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New sale exchange</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Original sale</Label>
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
            <Input id="reason" placeholder="Wrong size" {...form.register("reason")} />
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
                  <Input className="w-28" placeholder="0" {...form.register(`return_${item.id}`)} />
                </div>
              ))}
            </div>
          )}

          <LineItemsField
            control={form.control}
            name="newItems"
            productOptions={productOptions}
            columns={[
              { name: "quantity", label: "Quantity" },
              { name: "price", label: "Price" },
            ]}
            emptyItem={{ productId: "", quantity: "", price: "" }}
          />

          <div className="space-y-1.5">
            <Label htmlFor="couponCode">Coupon code for replacement items (optional)</Label>
            <Input id="couponCode" placeholder="WELCOME20" {...form.register("couponCode")} />
          </div>

          {extraCharges.length > 0 && (
            <div className="space-y-1.5">
              <Label>Extra charges on replacement items</Label>
              <Controller
                control={form.control}
                name="extraChargeIds"
                render={({ field }) => (
                  <div className="grid grid-cols-2 gap-1.5 rounded-md border p-3">
                    {extraCharges.map((charge) => {
                      const selected: string[] = field.value ?? [];
                      return (
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
                      );
                    })}
                  </div>
                )}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Settle difference via</Label>
            <Controller
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <Select value={field.value ?? "CASH"} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Recording…" : "Record exchange"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
