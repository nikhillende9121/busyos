"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { ProductBatchView } from "@/modules/inventory/types/inventory.types";
import type { WarehouseView } from "@/modules/warehouse/types/warehouse.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

const ALL = "__all__";

const EXPIRY_WINDOW_OPTIONS = [
  { label: "Every batch", value: ALL },
  { label: "Expiring within 7 days", value: "7" },
  { label: "Expiring within 30 days", value: "30" },
  { label: "Expiring within 90 days", value: "90" },
];

// Soon-to-expire and already-expired get a visible flag — everything else
// reads as a plain row. See Docs/batch_expiry_tracking_plan.md §12.
function expiryBadge(daysUntilExpiry: number | null) {
  if (daysUntilExpiry === null) return <span className="text-muted-foreground">No expiry</span>;
  if (daysUntilExpiry < 0) return <Badge variant="destructive">Expired {Math.abs(daysUntilExpiry)}d ago</Badge>;
  if (daysUntilExpiry <= 30) return <Badge variant="destructive">{daysUntilExpiry}d left</Badge>;
  return <span>{daysUntilExpiry}d left</span>;
}

export default function ProductBatchesPage() {
  const [warehouseId, setWarehouseId] = useState<string>(ALL);
  const [productId, setProductId] = useState<string>(ALL);
  const [expiringWithinDays, setExpiringWithinDays] = useState<string>(ALL);
  const [page, setPage] = useState(1);

  const { data: warehouses } = useQuery({
    queryKey: queryKeys.list("warehouses"),
    queryFn: () => apiClient.get<WarehouseView[]>("/warehouses"),
  });
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });

  const batchParams = {
    warehouseId: warehouseId === ALL ? undefined : warehouseId,
    productId: productId === ALL ? undefined : productId,
    expiringWithinDays: expiringWithinDays === ALL ? undefined : Number(expiringWithinDays),
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.list("product-batches", { ...batchParams, page }),
    queryFn: () => apiClient.get<Paginated<ProductBatchView>>("/inventory/batches", { ...batchParams, page, pageSize: 20 }),
  });

  const warehouseName = (id: string) => warehouses?.find((w) => w.id === id)?.name ?? id;

  const columns: DataTableColumn<ProductBatchView>[] = [
    { key: "batchNumber", header: "Batch #" },
    { key: "productName", header: "Product", render: (row) => row.productName ?? row.productId },
    { key: "warehouseId", header: "Warehouse", render: (row) => warehouseName(row.warehouseId) },
    { key: "quantity", header: "Quantity" },
    {
      key: "expiryDate",
      header: "Expiry",
      render: (row) => (row.expiryDate ? new Date(row.expiryDate).toLocaleDateString() : "—"),
    },
    { key: "daysUntilExpiry", header: "Status", render: (row) => expiryBadge(row.daysUntilExpiry) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold font-heading">Batches</h1>
        <p className="text-muted-foreground">Batch/lot stock on hand with expiry tracking, per warehouse and product.</p>
      </div>

      <div className="flex flex-wrap gap-3">
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
            {(products?.items ?? []).filter((p) => p.trackBatches).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={expiringWithinDays}
          onValueChange={(value) => {
            setExpiringWithinDays(value ?? ALL);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPIRY_WINDOW_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        emptyMessage="No batch stock on hand."
        pagination={data?.pagination}
        onPageChange={setPage}
      />
    </div>
  );
}
