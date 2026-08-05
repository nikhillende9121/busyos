"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import type { InventoryBalanceView } from "@/modules/inventory/types/inventory.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

const ALL = "__all__";

const columns: DataTableColumn<InventoryBalanceView & { productName: string }>[] = [
  { key: "productName", header: "Product" },
  { key: "quantity", header: "Quantity" },
  { key: "updatedAt", header: "Updated", render: (row) => new Date(row.updatedAt).toLocaleString() },
];

// Trimmed copy of app/(dashboard)/inventory/balance/page.tsx — no
// warehouse filter (hard-locked to the caller's own store) and no
// warehouse column (every row is the same one). See
// Docs/STORE_APP_GUIDE.md.
export default function StoreInventoryPage() {
  const { user } = useAuth();
  const [productId, setProductId] = useState<string>(ALL);

  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.list("inventory-balance", { warehouseId: user?.warehouseId, productId }),
    queryFn: () =>
      apiClient.get<InventoryBalanceView[]>("/inventory/balance", {
        warehouseId: user?.warehouseId ?? undefined,
        productId: productId === ALL ? undefined : productId,
      }),
    enabled: Boolean(user?.warehouseId),
  });

  const productName = (id: string) => products?.items.find((p) => p.id === id)?.name ?? id;

  const rows = (data ?? []).map((row) => ({ ...row, productName: productName(row.productId) }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold font-heading">Inventory</h1>
        <p className="text-muted-foreground">Current stock on hand at {user?.warehouseName ?? "your store"}.</p>
      </div>

      <Select value={productId} onValueChange={(value) => setProductId(value ?? ALL)}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="All products" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All products</SelectItem>
          {(products?.items ?? []).map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        getRowId={(row) => row.productId}
        emptyMessage="No stock recorded yet."
      />
    </div>
  );
}
