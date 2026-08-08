"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { PriceListView } from "@/modules/pricing/types/price-list.types";
import type { WarehouseView } from "@/modules/warehouse/types/warehouse.types";
import type { CustomerGroupView } from "@/modules/pricing/types/customer-group.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";

export default function PriceListDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: priceList, isLoading } = useQuery({
    queryKey: queryKeys.detail("price-lists", id),
    queryFn: () => apiClient.get<PriceListView>(`/price-lists/${id}`),
  });
  const { data: warehouses } = useQuery({
    queryKey: queryKeys.list("warehouses"),
    queryFn: () => apiClient.get<WarehouseView[]>("/warehouses"),
  });
  const { data: customerGroups } = useQuery({
    queryKey: queryKeys.list("customer-groups"),
    queryFn: () => apiClient.get<CustomerGroupView[]>("/customer-groups"),
  });
  const { data: products } = useQuery({
    queryKey: queryKeys.list("products", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page: 1, pageSize: 100 }),
  });

  const productLabel = (productId: string) => {
    const product = products?.items.find((p) => p.id === productId);
    return product ? `${product.sku} — ${product.name}` : productId;
  };

  if (isLoading || !priceList) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const warehouseName = priceList.warehouseId
    ? warehouses?.find((w) => w.id === priceList.warehouseId)?.name ?? priceList.warehouseId
    : "All warehouses";
  const customerGroupName = priceList.customerGroupId
    ? customerGroups?.find((g) => g.id === priceList.customerGroupId)?.name ?? priceList.customerGroupId
    : "All customers";

  return (
    <div className="space-y-6">
      <Link
        href="/price-lists"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to price lists
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">{priceList.name}</h1>
          <p className="text-muted-foreground">
            {warehouseName} — {customerGroupName} — {priceList.currency}
          </p>
        </div>
        {priceList.isDefault && <Badge>Default</Badge>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Products &amp; prices</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Min quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {priceList.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No products in this price list.
                  </TableCell>
                </TableRow>
              ) : (
                priceList.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{productLabel(item.productId)}</TableCell>
                    <TableCell>{item.price}</TableCell>
                    <TableCell>{item.minQuantity}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
