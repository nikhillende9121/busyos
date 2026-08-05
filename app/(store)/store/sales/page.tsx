"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, Search, Minus, X, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import type { SaleView } from "@/modules/sales/types/sale.types";
import type { CustomerView } from "@/modules/customer/types/customer.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { ExtraChargeView } from "@/modules/extra-charge/types/extra-charge.types";
import type { Paginated } from "@/shared/utils/pagination";

type Row = SaleView & { customerName: string };

type CartLine = {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  price: string;
};

// Was a dashboard-style DataTable + form-in-a-dialog copy of
// app/(dashboard)/sales/page.tsx (see git history) — replaced with a
// checkout-style flow per Docs/STORE_APP_GUIDE.md's "closer to a checkout
// flow than an admin form" goal: tap products into a cart instead of
// filling a dynamic form-array row by row. Still the exact same
// POST /sales payload/validation underneath — only the input surface
// changed, not the API contract. History (list) mode is unchanged.
export default function StoreSalesPage() {
  const [mode, setMode] = useState<"list" | "checkout">("list");
  const queryClient = useQueryClient();
  const { can, user } = useAuth();

  const { data: sales, isLoading } = useQuery({
    queryKey: queryKeys.list("sales"),
    queryFn: () => apiClient.get<SaleView[]>("/sales"),
  });
  const { data: customers } = useQuery({
    queryKey: queryKeys.list("customers"),
    queryFn: () => apiClient.get<CustomerView[]>("/customers"),
  });
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 200 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 200 }),
  });
  const { data: extraCharges } = useQuery({
    queryKey: queryKeys.list("extra-charges"),
    queryFn: () => apiClient.get<ExtraChargeView[]>("/extra-charges"),
  });

  const customerName = (id: string) => customers?.find((c) => c.id === id)?.name ?? id;

  if (mode === "checkout") {
    return (
      <CheckoutScreen
        products={products?.items ?? []}
        customers={customers ?? []}
        extraCharges={extraCharges ?? []}
        warehouseId={user!.warehouseId!}
        onDone={() => setMode("list")}
        onCreated={() => queryClient.invalidateQueries({ queryKey: queryKeys.list("sales") })}
      />
    );
  }

  const columns: DataTableColumn<Row>[] = [
    {
      key: "id",
      header: "ID",
      render: (row) => (
        <Link href={`/store/sales/${row.id}`} className="underline underline-offset-2">
          #{row.id}
        </Link>
      ),
    },
    { key: "customerName", header: "Customer" },
    { key: "channel", header: "Channel", render: (row) => <Badge variant="outline">{row.channel}</Badge> },
    { key: "status", header: "Status", render: (row) => <Badge>{row.status}</Badge> },
    { key: "saleDate", header: "Date", render: (row) => new Date(row.saleDate).toLocaleDateString() },
  ];

  const rows: Row[] = (sales ?? []).map((s) => ({ ...s, customerName: customerName(s.customerId) }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Sales</h1>
          <p className="text-muted-foreground">Sales at {user?.warehouseName ?? "your store"}.</p>
        </div>
        {can("SALE.CREATE") && (
          <Button size="lg" onClick={() => setMode("checkout")}>
            <Plus /> New sale
          </Button>
        )}
      </div>

      <DataTable columns={columns} rows={rows} isLoading={isLoading} getRowId={(row) => row.id} emptyMessage="No sales yet." />
    </div>
  );
}

function CheckoutScreen({
  products,
  customers,
  extraCharges,
  warehouseId,
  onDone,
  onCreated,
}: {
  products: ProductView[];
  customers: CustomerView[];
  extraCharges: ExtraChargeView[];
  warehouseId: string;
  onDone: () => void;
  onCreated: () => void;
}) {
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [extraChargeIds, setExtraChargeIds] = useState<string[]>([]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode?.includes(q),
    );
  }, [products, search]);

  const addToCart = (product: ProductView) => {
    setCart((lines) => {
      const existing = lines.find((l) => l.productId === product.id);
      if (existing) {
        return lines.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...lines, { productId: product.id, sku: product.sku, name: product.name, quantity: 1, price: "" }];
    });
  };

  const updateLine = (productId: string, patch: Partial<CartLine>) => {
    setCart((lines) => lines.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  };

  const removeLine = (productId: string) => {
    setCart((lines) => lines.filter((l) => l.productId !== productId));
  };

  const subtotal = cart.reduce((sum, line) => sum + line.quantity * (Number(line.price) || 0), 0);

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiClient.post<SaleView>("/sales", payload),
    onSuccess: () => {
      onCreated();
      toast.success("Sale created");
      onDone();
    },
  });

  const handleCharge = async () => {
    if (!customerId) {
      toast.error("Select a customer first.");
      return;
    }
    if (cart.length === 0) {
      toast.error("Add at least one product to the cart.");
      return;
    }
    if (cart.some((l) => !l.price || Number(l.price) < 0)) {
      toast.error("Enter a price for every cart line.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        customerId,
        warehouseId,
        channel: "POS",
        saleDate: new Date().toISOString().slice(0, 10),
        couponCode: couponCode || undefined,
        extraChargeIds,
        items: cart.map((l) => ({ productId: l.productId, quantity: String(l.quantity), price: l.price })),
      });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 lg:flex-row">
      {/* Product picker */}
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onDone}>
            Back
          </Button>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search product name, SKU, or barcode…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-2.5 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => addToCart(product)}
              className="flex flex-col items-start gap-1 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent active:scale-[0.98]"
            >
              <div className="flex h-16 w-full items-center justify-center rounded-lg bg-muted">
                {product.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external Cloudinary URL
                  <img
                    src={product.images[0].thumbnailUrl}
                    alt=""
                    className="h-full w-full rounded-lg object-cover"
                  />
                ) : (
                  <ShoppingCart className="size-6 text-muted-foreground" />
                )}
              </div>
              <p className="w-full truncate text-sm font-medium">{product.name}</p>
              <p className="text-xs text-muted-foreground">{product.sku}</p>
            </button>
          ))}
          {filteredProducts.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No products match.</p>
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="flex w-full flex-col gap-3 rounded-xl border bg-card p-4 lg:w-96">
        <div className="space-y-1.5">
          <Label>Customer</Label>
          <Select value={customerId} onValueChange={(value) => setCustomerId(value ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select customer" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto">
          {cart.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">Tap a product to add it to the cart.</p>
          )}
          {cart.map((line) => (
            <div key={line.productId} className="flex items-center gap-2 rounded-lg border p-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{line.name}</p>
                <p className="text-xs text-muted-foreground">{line.sku}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => updateLine(line.productId, { quantity: Math.max(1, line.quantity - 1) })}
                >
                  <Minus className="size-3.5" />
                </Button>
                <span className="w-6 text-center text-sm tabular-nums">{line.quantity}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => updateLine(line.productId, { quantity: line.quantity + 1 })}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <Input
                type="number"
                placeholder="Price"
                className="w-20"
                value={line.price}
                onChange={(e) => updateLine(line.productId, { price: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeLine(line.productId)}
                aria-label="Remove line"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <Input
            placeholder="Coupon code (optional)"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
          />
        </div>

        {extraCharges.length > 0 && (
          <div className="space-y-1.5 rounded-md border p-2">
            {extraCharges.map((charge) => (
              <label key={charge.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={extraChargeIds.includes(charge.id)}
                  onCheckedChange={(checked) => {
                    setExtraChargeIds((current) =>
                      checked ? [...current, charge.id] : current.filter((id) => id !== charge.id),
                    );
                  }}
                />
                {charge.name} ({charge.calcType === "FLAT" ? charge.value : `${charge.value}%`})
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">Subtotal ({cart.length} item{cart.length === 1 ? "" : "s"})</span>
          <span className="font-mono tabular-nums">{subtotal.toFixed(2)}</span>
        </div>
        <p className="text-xs text-muted-foreground">Tax, charges, and discounts are applied on confirm.</p>

        <Button size="lg" className="w-full" disabled={createMutation.isPending} onClick={() => void handleCharge()}>
          {createMutation.isPending ? "Charging…" : `Charge ${subtotal.toFixed(2)}`}
        </Button>
      </div>
    </div>
  );
}
