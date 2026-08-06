// The dashboard's nav is built up one module at a time, matching the
// phased rollout in the implementation plan — each phase adds its items
// here rather than introducing a new data shape. An item only appears once
// its page actually exists (no dead links), once the current user's role
// holds its gating permission, AND (when `feature` is set) once the
// tenant's plan actually has that feature enabled — lib/auth/auth-
// context.tsx's `can`/`hasFeature`. This is a UX convenience only, not the
// enforcement boundary, which stays server-side in
// shared/middleware/with-api-auth.ts regardless of what the sidebar shows.
// `feature` must match exactly the `feature:` option the item's backing
// route(s) pass to withApiAuth — omit it for routes with no feature gate
// (core admin: Roles/Users/Tenant Settings/Warehouses/Tax Rates/Extra
// Charges — see shared/constants/permissions.ts's sibling reasoning).
export type NavItem = {
  label: string;
  href: string;
  permission: string;
  feature?: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Catalog",
    items: [
      { label: "Products", href: "/products", permission: "PRODUCT.VIEW", feature: "PRODUCT" },
      { label: "Warehouses", href: "/warehouses", permission: "WAREHOUSE.VIEW" },
      { label: "Categories", href: "/categories", permission: "CATEGORY.VIEW", feature: "CATEGORY" },
      { label: "Brands", href: "/brands", permission: "BRAND.VIEW", feature: "BRAND" },
      { label: "Units", href: "/units", permission: "UNIT.VIEW", feature: "UNIT" },
    ],
  },
  {
    title: "Inventory",
    items: [
      { label: "Balance", href: "/inventory/balance", permission: "INVENTORY.VIEW", feature: "INVENTORY" },
      { label: "Adjustments", href: "/inventory/adjustments", permission: "INVENTORY.ADJUST", feature: "INVENTORY" },
      { label: "Stock Transfers", href: "/stock-transfers", permission: "STOCK_TRANSFER.VIEW", feature: "STOCK_TRANSFER" },
    ],
  },
  {
    title: "Purchasing",
    items: [
      { label: "Purchases", href: "/purchases", permission: "PURCHASE.VIEW", feature: "PURCHASE" },
      { label: "Purchase Returns", href: "/purchase-returns", permission: "PURCHASE_RETURN.VIEW", feature: "PURCHASE_RETURN" },
      { label: "Suppliers", href: "/suppliers", permission: "SUPPLIER.VIEW", feature: "SUPPLIER" },
    ],
  },
  {
    title: "Sales",
    items: [
      { label: "Sales", href: "/sales", permission: "SALE.VIEW", feature: "SALES" },
      { label: "Sale Returns", href: "/sale-returns", permission: "SALE_RETURN.VIEW", feature: "SALE_RETURN" },
      { label: "Sale Exchanges", href: "/sale-exchanges", permission: "SALE.EXCHANGE", feature: "SALE_EXCHANGE" },
      { label: "Customers", href: "/customers", permission: "CUSTOMER.VIEW", feature: "CUSTOMER" },
      { label: "Customer Groups", href: "/customer-groups", permission: "CUSTOMER_GROUP.VIEW", feature: "CUSTOMER_GROUP" },
    ],
  },
  {
    title: "Pricing",
    items: [
      { label: "Price Lists", href: "/price-lists", permission: "PRICE_LIST.VIEW", feature: "PRICE_LIST" },
      { label: "Discounts", href: "/discounts", permission: "DISCOUNT.VIEW", feature: "DISCOUNT" },
      { label: "Coupons", href: "/coupons", permission: "COUPON.VIEW", feature: "COUPON" },
      { label: "Quote Simulator", href: "/pricing-quote", permission: "SALE.VIEW", feature: "PRICE_LIST" },
    ],
  },
  {
    title: "Taxation",
    items: [
      { label: "Tax Rates", href: "/tax-rates", permission: "TAX_RATE.VIEW" },
      { label: "Extra Charges", href: "/extra-charges", permission: "EXTRA_CHARGE.VIEW" },
      { label: "GST Report", href: "/reports/gst", permission: "SALE.VIEW", feature: "SALES" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Roles", href: "/roles", permission: "ROLE.VIEW" },
      { label: "Users", href: "/users", permission: "USER.VIEW" },
    ],
  },
  {
    title: "Settings",
    items: [{ label: "Tenant Settings", href: "/settings", permission: "TENANT.VIEW" }],
  },
];
