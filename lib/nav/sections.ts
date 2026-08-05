// The dashboard's nav is built up one module at a time, matching the
// phased rollout in the implementation plan — each phase adds its items
// here rather than introducing a new data shape. An item only appears once
// its page actually exists (no dead links) and once the current user's
// role holds its gating permission (lib/auth/auth-context.tsx's `can`) —
// this is a UX convenience only, not the enforcement boundary, which stays
// server-side in shared/middleware/with-api-auth.ts regardless of what the
// sidebar shows.
export type NavItem = {
  label: string;
  href: string;
  permission: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Catalog",
    items: [
      { label: "Products", href: "/products", permission: "PRODUCT.VIEW" },
      { label: "Warehouses", href: "/warehouses", permission: "WAREHOUSE.VIEW" },
      { label: "Categories", href: "/categories", permission: "CATEGORY.VIEW" },
      { label: "Brands", href: "/brands", permission: "BRAND.VIEW" },
      { label: "Units", href: "/units", permission: "UNIT.VIEW" },
    ],
  },
  {
    title: "Inventory",
    items: [
      { label: "Balance", href: "/inventory/balance", permission: "INVENTORY.VIEW" },
      { label: "Adjustments", href: "/inventory/adjustments", permission: "INVENTORY.ADJUST" },
      { label: "Stock Transfers", href: "/stock-transfers", permission: "STOCK_TRANSFER.VIEW" },
    ],
  },
  {
    title: "Purchasing",
    items: [
      { label: "Purchases", href: "/purchases", permission: "PURCHASE.VIEW" },
      { label: "Purchase Returns", href: "/purchase-returns", permission: "PURCHASE_RETURN.VIEW" },
      { label: "Suppliers", href: "/suppliers", permission: "SUPPLIER.VIEW" },
    ],
  },
  {
    title: "Sales",
    items: [
      { label: "Sales", href: "/sales", permission: "SALE.VIEW" },
      { label: "Sale Returns", href: "/sale-returns", permission: "SALE_RETURN.VIEW" },
      { label: "Customers", href: "/customers", permission: "CUSTOMER.VIEW" },
      { label: "Customer Groups", href: "/customer-groups", permission: "CUSTOMER_GROUP.VIEW" },
    ],
  },
  {
    title: "Pricing",
    items: [
      { label: "Price Lists", href: "/price-lists", permission: "PRICE_LIST.VIEW" },
      { label: "Discounts", href: "/discounts", permission: "DISCOUNT.VIEW" },
      { label: "Coupons", href: "/coupons", permission: "COUPON.VIEW" },
      { label: "Quote Simulator", href: "/pricing-quote", permission: "SALE.VIEW" },
    ],
  },
  {
    title: "Taxation",
    items: [
      { label: "Tax Rates", href: "/tax-rates", permission: "TAX_RATE.VIEW" },
      { label: "Extra Charges", href: "/extra-charges", permission: "EXTRA_CHARGE.VIEW" },
      { label: "GST Report", href: "/reports/gst", permission: "SALE.VIEW" },
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
