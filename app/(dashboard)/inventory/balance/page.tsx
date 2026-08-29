"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { ExportButton } from "@/components/resource/export-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { InventoryBalanceView } from "@/modules/inventory/types/inventory.types";
import type { WarehouseView } from "@/modules/warehouse/types/warehouse.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

const ALL = "__all__";

const columns: DataTableColumn<InventoryBalanceView & { warehouseName: string; productName: string }>[] = [
  { key: "warehouseName", header: "Warehouse" },
  { key: "productName", header: "Product" },
  { key: "quantity", header: "Quantity" },
  { key: "updatedAt", header: "Updated", render: (row) => new Date(row.updatedAt).toLocaleString() },
];

export default function InventoryBalancePage() {
  const [warehouseId, setWarehouseId] = useState<string>(ALL);
  const [productId, setProductId] = useState<string>(ALL);
  const [page, setPage] = useState(1);

  const { data: warehouses } = useQuery({
    queryKey: queryKeys.list("warehouses"),
    queryFn: () => apiClient.get<WarehouseView[]>("/warehouses"),
  });
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });

  const balanceParams = {
    warehouseId: warehouseId === ALL ? undefined : warehouseId,
    productId: productId === ALL ? undefined : productId,
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.list("inventory-balance", { ...balanceParams, page }),
    queryFn: () =>
      apiClient.get<Paginated<InventoryBalanceView>>("/inventory/balance", { ...balanceParams, page, pageSize: 20 }),
  });

  const warehouseName = (id: string) => warehouses?.find((w) => w.id === id)?.name ?? id;
  const productName = (id: string) => products?.items.find((p) => p.id === id)?.name ?? id;

  const rows = (data?.items ?? []).map((row) => ({
    ...row,
    warehouseName: warehouseName(row.warehouseId),
    productName: productName(row.productId),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold font-heading">Inventory Balance</h1>
        <p className="text-muted-foreground">Current stock on hand, per warehouse and product.</p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-3">
          <Select
            value={warehouseId}
            onValueChange={(value) => {
              setWarehouseId(value ?? ALL);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All warehouses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All warehouses</SelectItem>
              {(warehouses ?? []).map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={productId}
            onValueChange={(value) => {
              setProductId(value ?? ALL);
              setPage(1);
            }}
          >
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
        </div>
        <ExportButton resource="inventory/balance" params={balanceParams} />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        getRowId={(row) => `${row.warehouseId}-${row.productId}`}
        emptyMessage="No stock recorded yet."
        pagination={data?.pagination}
        onPageChange={setPage}
      />
    </div>
  );
}
