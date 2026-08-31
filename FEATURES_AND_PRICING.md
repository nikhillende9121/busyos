# RetailX — Features & Pricing

A business-facing map of everything the platform does today, organized
the way a customer would think about it, with each feature assigned to a
plan tier and a proposed price for that tier.

---

## 1. Feature list, by business area

### Store & Staff Setup — *always included, every plan*
- **Multi-warehouse / multi-store management** — register as many physical
  stores or warehouses as your plan's limit allows; each operates its own
  live stock count.
- **Staff accounts & role-based access** — Cashier, Store Manager, Admin,
  or as many custom roles as your plan's limit allows; each user can be
  restricted to exactly one store, or given access across all of them.
- **Tax rate configuration** — CGST/SGST/IGST/CESS components, per-product
  tax rates or a tenant-wide default.
- **Tenant branding** — your own logo across the web app.

### Product Catalog
- **Product catalog** — SKU, barcode, images, status.
- **Categories, brands, units of measure** — the organizing structure
  behind the catalog.

### Purchasing
- **Suppliers** — supplier directory.
- **Purchases** — purchase orders, confirm, receive (partial receipt
  supported), cancel.
- **Purchase returns** — return received stock to a supplier.

### Selling
- **Sales / POS** — ring up a sale from a product grid + cart, across
  POS, online, marketplace, or phone channels; full lifecycle
  (confirm → pack → ship → deliver, or the POS-shortcut complete).
- **Sale returns** — discount-aware refunds on past sales.
- **Sale exchanges** — return item(s) and sell replacement item(s) in one
  transaction, with the price difference settled on the spot.
- **Customers & customer groups** — customer directory and tiered
  customer segments for pricing.

### Pricing & Promotions
- **Price lists** — per-store or per-customer-group pricing, with
  quantity-tier pricing.
- **Discounts** — automatic, rule-based discounts.
- **Coupons** — code-redeemed discounts with usage limits.
- **Extra charges** — packing, shipping, or any other flat/percentage fee,
  attachable to a sale.

### Inventory & Fulfillment
- **Live inventory balance** — real-time stock per product per store.
- **Stock adjustments** — manual corrections (opening stock, stock-takes,
  shrinkage).
- **Stock transfers** — move stock between your own stores, with
  ship/receive tracking.

### Reporting
- **Dashboard insights** — revenue, open sales, pending purchases,
  low-stock lines, top products, at a glance.
- **GST report** — output vs. input tax, net payable, for a given period.

### Point-of-sale experience
- **Store checkout screen** — a simplified, tap-first POS view (product
  grid, cart, one "Charge" action) for store-floor staff, separate from
  the full admin dashboard.

---

## 2. Plan tiers

*All plans are billed annually.*

| | **Starter** | **Growth** | **Enterprise** |
|---|---|---|---|
| **Price** | ₹14,990 / year | ₹24,999 / year | Custom — contact us |
| Effective monthly | ₹1,249 / mo | ₹2,083 / mo | — |
| Warehouses | 1 | Up to 5 | Unlimited |
| Users | Up to 3 | Up to 15 | Unlimited |
| Custom roles | Up to 3 | Up to 10 | Unlimited |
| Product catalog (+ categories/brands/units) | ✅ | ✅ | ✅ |
| Suppliers & Purchasing | ✅ | ✅ | ✅ |
| Sales / POS (all channels) | ✅ | ✅ | ✅ |
| Customers | ✅ | ✅ | ✅ |
| Store checkout screen | ✅ | ✅ | ✅ |
| Tax rates | ✅ | ✅ | ✅ |
| Dashboard insights | ✅ | ✅ | ✅ |
| Purchase returns | — | ✅ | ✅ |
| Sale returns & exchanges | — | ✅ | ✅ |
| Customer groups | — | ✅ | ✅ |
| Price lists, discounts, coupons, extra charges | — | ✅ | ✅ |
| Stock transfers (multi-store) | — | ✅ | ✅ |
| GST report | — | ✅ | ✅ |
| Support | Email | Priority | Dedicated onboarding + account manager |
| Custom reporting | — | — | ✅ |

**Billing**: All plans are billed annually; the yearly price already
includes a discount over paying month to month. Month-to-month billing is
available on request (Starter ₹1,499 / mo, Growth ₹3,999 / mo).

---

## 3. Reasoning behind the split

- **Starter** covers a single store's complete sales-to-purchasing loop —
  everything needed to actually run one location day to day. What it
  deliberately excludes (returns/exchanges, multi-store transfers,
  pricing tiers) are things a single new store rarely needs on day one.
- **Growth** is the multi-store tier: the moment a business opens a
  second location, stock transfers and centralized pricing stop being
  optional. Returns/exchanges and customer segmentation round it out as
  the "running a real retail operation" tier.
- **Enterprise** removes every ceiling (warehouses, users, roles) and adds
  the things that only matter at chain scale — dedicated support and
  reporting built around a specific business's needs.
- Staff/access management (roles, users, warehouses, tenant settings) and
  tax rate configuration are **never gated** — restricting a business's
  ability to manage its own staff or see its own tax rates isn't a real
  pricing lever, it's just a support problem waiting to happen. Custom
  role *count* is still capped per tier the same way warehouses/users
  are (a quota, not an on/off switch) — see `Plan.maxRoles`.
- GST report moved behind the Growth+ line alongside the other
  pricing/tax-adjacent features it ships with (extra charges, price
  lists, discounts, coupons) — unlike tax *rate configuration* (which
  stays universal), the report itself is a value-add view, not a
  compliance obligation the platform owes every tenant regardless of
  plan.

---

## 4. Mapping to the system's actual feature flags

For implementation reference — each row above corresponds to one or more
of the platform's internal feature codes, enforced per-request in
`shared/middleware/with-api-auth.ts` and granted to a tenant by attaching
that code to their subscribed Plan (`modules/super-admin/service/
plan.service.ts` / `tenant.service.ts`):

| Business feature | Feature code(s) |
|---|---|
| Product catalog | `PRODUCT`, `CATEGORY`, `BRAND`, `UNIT` |
| Suppliers & Purchasing | `SUPPLIER`, `PURCHASE` |
| Purchase returns | `PURCHASE_RETURN` |
| Sales / POS | `SALES` |
| Sale returns / exchanges | `SALE_RETURN`, `SALE_EXCHANGE` |
| Customers / groups | `CUSTOMER`, `CUSTOMER_GROUP` |
| Price lists / discounts / coupons | `PRICE_LIST`, `DISCOUNT`, `COUPON` |
| Extra charges | `EXTRA_CHARGE` |
| GST report | `GST_REPORT` |
| Inventory & adjustments | `INVENTORY` |
| Stock transfers | `STOCK_TRANSFER` |
| Warehouses, staff/roles, tax rates | ungated — no feature flag, permission-only |

Warehouse/user/role *counts* are enforced separately via
`Plan.maxWarehouses`/`Plan.maxUsers`/`Plan.maxRoles`, not the feature-flag
system.