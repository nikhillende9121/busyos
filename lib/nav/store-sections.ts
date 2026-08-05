// Mirrors lib/nav/sections.ts's NavItem shape, but flat (no section
// grouping — /store/** only ever has this handful of items) and scoped
// to exactly the Store Manager capability set documented in
// Docs/MOBILE_API_GUIDE.md §5/§7. No STOCK_TRANSFER.APPROVE here on
// purpose — approving a transfer picks the *source* warehouse, a
// cross-store decision that belongs to an admin, not a single store's
// own manager.
import type { NavItem } from "./sections";

export const STORE_NAV_ITEMS: NavItem[] = [
  { label: "Sales", href: "/store/sales", permission: "SALE.VIEW" },
  { label: "Sale Returns", href: "/store/sale-returns", permission: "SALE_RETURN.VIEW" },
  { label: "Sale Exchanges", href: "/store/sale-exchanges", permission: "SALE.EXCHANGE" },
  { label: "Purchases", href: "/store/purchases", permission: "PURCHASE.VIEW" },
  { label: "Purchase Returns", href: "/store/purchase-returns", permission: "PURCHASE_RETURN.VIEW" },
  { label: "Inventory", href: "/store/inventory", permission: "INVENTORY.VIEW" },
  { label: "Adjustments", href: "/store/adjustments", permission: "INVENTORY.ADJUST" },
  { label: "Stock Transfers", href: "/store/stock-transfers", permission: "STOCK_TRANSFER.VIEW" },
];
