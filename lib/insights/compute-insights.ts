import type { SaleView } from "@/modules/sales/types/sale.types";
import type { PurchaseView } from "@/modules/purchase/types/purchase.types";
import type { ProductView } from "@/modules/product/types/product.types";
import type { InventoryBalanceView } from "@/modules/inventory/types/inventory.types";
import type { CustomerView } from "@/modules/customer/types/customer.types";
import type { SupplierView } from "@/modules/supplier/types/supplier.types";
import type { WarehouseView } from "@/modules/warehouse/types/warehouse.types";
import type { CouponView } from "@/modules/pricing/types/coupon.types";
import type { DiscountView } from "@/modules/pricing/types/discount.types";
import type { Paginated } from "@/shared/utils/pagination";

// Pure aggregation over data the dashboard already fetches elsewhere — no
// new backend endpoints. Kept free of React/fetch so it's trivially unit
// tested (see compute-insights.test.ts) and so app/(dashboard)/page.tsx
// stays a thin rendering layer.

// No per-product/warehouse reorder point exists in the schema yet — this
// is a fixed placeholder, not a tenant-configurable setting. Revisit if a
// real "low stock" business rule is ever added to Product/InventoryBalance.
export const LOW_STOCK_THRESHOLD = 10;

// "Revenue" counts a sale once stock has actually left and hasn't been
// reversed — DRAFT/PENDING_PAYMENT haven't happened yet, CANCELLED
// reversed whatever left. Deliberately excludes tax (summing `price`, not
// price+tax) — tax collected on behalf of the government isn't revenue;
// see lib/insights/compute-gst-insights.ts for tax collected/paid/net
// payable, computed separately from this file.
const REVENUE_SALE_STATUSES = new Set(["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED", "COMPLETED"]);
const CLOSED_SALE_STATUSES = new Set(["DELIVERED", "COMPLETED", "CANCELLED"]);
const PENDING_PURCHASE_STATUSES = new Set(["DRAFT", "ORDERED", "PARTIALLY_RECEIVED"]);

export type DashboardInsightsInput = {
  sales: SaleView[];
  purchases: PurchaseView[];
  products: Paginated<ProductView>;
  balances: InventoryBalanceView[];
  customers: CustomerView[];
  suppliers: SupplierView[];
  warehouses: WarehouseView[];
  coupons: CouponView[];
  discounts: DiscountView[];
  /** Injectable for deterministic tests; defaults to the real current time. */
  now?: Date;
};

export type StatusCount = { status: string; count: number };
export type ChannelCount = { channel: string; count: number };
export type ProductRevenue = { productId: string; productName: string; revenue: number };
export type LowStockLine = {
  warehouseId: string;
  warehouseName: string;
  productId: string;
  productName: string;
  quantity: number;
};
export type RecentSale = {
  id: string;
  customerName: string;
  status: string;
  channel: string;
  saleDate: string;
  total: number;
};
export type RecentPurchase = { id: string; supplierName: string; status: string; purchaseDate: string };

export type DashboardInsights = {
  kpis: {
    totalRevenue: number;
    totalProducts: number;
    openSalesCount: number;
    pendingPurchasesCount: number;
    lowStockCount: number;
    totalCustomers: number;
    activeCouponsCount: number;
    activeDiscountsCount: number;
  };
  salesByStatus: StatusCount[];
  salesByChannel: ChannelCount[];
  topProductsByRevenue: ProductRevenue[];
  recentSales: RecentSale[];
  recentPurchases: RecentPurchase[];
  lowStockLines: LowStockLine[];
};

function saleNetAmount(sale: SaleView): number {
  const gross = sale.items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  const discountTotal = sale.discounts.reduce((sum, discount) => sum + Number(discount.amount), 0);
  return gross - discountTotal;
}

function isCurrentlyActive(entity: { isActive: boolean; startDate: string; endDate: string | null }, now: Date): boolean {
  if (!entity.isActive) return false;
  if (new Date(entity.startDate) > now) return false;
  if (entity.endDate && new Date(entity.endDate) < now) return false;
  return true;
}

export function buildDashboardInsights(input: DashboardInsightsInput): DashboardInsights {
  const now = input.now ?? new Date();

  const productName = (id: string) => input.products.items.find((p) => p.id === id)?.name ?? id;
  const warehouseName = (id: string) => input.warehouses.find((w) => w.id === id)?.name ?? id;
  const customerName = (id: string) => input.customers.find((c) => c.id === id)?.name ?? id;
  const supplierName = (id: string) => input.suppliers.find((s) => s.id === id)?.name ?? id;

  const revenueSales = input.sales.filter((sale) => REVENUE_SALE_STATUSES.has(sale.status));
  const totalRevenue = revenueSales.reduce((sum, sale) => sum + saleNetAmount(sale), 0);

  const openSalesCount = input.sales.filter((sale) => !CLOSED_SALE_STATUSES.has(sale.status)).length;
  const pendingPurchasesCount = input.purchases.filter((purchase) =>
    PENDING_PURCHASE_STATUSES.has(purchase.status),
  ).length;

  const lowStockLines: LowStockLine[] = input.balances
    .filter((balance) => Number(balance.quantity) <= LOW_STOCK_THRESHOLD)
    .map((balance) => ({
      warehouseId: balance.warehouseId,
      warehouseName: warehouseName(balance.warehouseId),
      productId: balance.productId,
      productName: productName(balance.productId),
      quantity: Number(balance.quantity),
    }))
    .sort((a, b) => a.quantity - b.quantity);

  const activeCouponsCount = input.coupons.filter((coupon) => isCurrentlyActive(coupon, now)).length;
  const activeDiscountsCount = input.discounts.filter((discount) => isCurrentlyActive(discount, now)).length;

  const statusCounts = new Map<string, number>();
  const channelCounts = new Map<string, number>();
  for (const sale of input.sales) {
    statusCounts.set(sale.status, (statusCounts.get(sale.status) ?? 0) + 1);
    channelCounts.set(sale.channel, (channelCounts.get(sale.channel) ?? 0) + 1);
  }
  const salesByStatus: StatusCount[] = Array.from(statusCounts, ([status, count]) => ({ status, count }));
  const salesByChannel: ChannelCount[] = Array.from(channelCounts, ([channel, count]) => ({ channel, count }));

  // Gross per-line revenue, not net-of-discount: scoped discounts are
  // already per-line, but order-level discounts aren't attributable to
  // one product, so this is "what sells" (a proxy), not an exact
  // net-revenue-per-product figure.
  const revenueByProduct = new Map<string, number>();
  for (const sale of revenueSales) {
    for (const item of sale.items) {
      const amount = Number(item.price) * Number(item.quantity);
      revenueByProduct.set(item.productId, (revenueByProduct.get(item.productId) ?? 0) + amount);
    }
  }
  const topProductsByRevenue: ProductRevenue[] = Array.from(revenueByProduct, ([productId, revenue]) => ({
    productId,
    productName: productName(productId),
    revenue,
  }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const recentSales: RecentSale[] = [...input.sales]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .map((sale) => ({
      id: sale.id,
      customerName: customerName(sale.customerId),
      status: sale.status,
      channel: sale.channel,
      saleDate: sale.saleDate,
      total: saleNetAmount(sale),
    }));

  const recentPurchases: RecentPurchase[] = [...input.purchases]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .map((purchase) => ({
      id: purchase.id,
      supplierName: supplierName(purchase.supplierId),
      status: purchase.status,
      purchaseDate: purchase.purchaseDate,
    }));

  return {
    kpis: {
      totalRevenue,
      totalProducts: input.products.pagination.total,
      openSalesCount,
      pendingPurchasesCount,
      lowStockCount: lowStockLines.length,
      totalCustomers: input.customers.length,
      activeCouponsCount,
      activeDiscountsCount,
    },
    salesByStatus,
    salesByChannel,
    topProductsByRevenue,
    recentSales,
    recentPurchases,
    lowStockLines,
  };
}
