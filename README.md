# Inventory Management System

Multi-tenant inventory, purchase, and sales management platform. Built as a
modular monolith so individual business domains (product, inventory,
purchase, sales, warehouse, supplier, customer) can later be extracted into
independent services without a rewrite — see
[`Docs/ARCHITECTURE.md`](Docs/ARCHITECTURE.md).

> **Status**: the full commerce loop — including returns, multi-warehouse
> stock transfers, the online fulfillment pipeline, and multi-tier pricing
> with discounts/coupons (including `PRODUCT`/`CATEGORY`-scoped coupons) —
> is implemented and verified end-to-end against a real MySQL database —
> `auth`, `tenant`, `product` (+ category/brand/unit), `warehouse`,
> `inventory` (balance/adjustments/transfers), `supplier`/`purchase`
> (+returns), `customer`/`sales` (+returns), `pricing` (customer groups,
> price lists, discounts, coupons). Migrated, seeded, and exercised through
> real HTTP requests — including creating a tiered price list, applying a
> stacked discount + a usage-limited coupon to a live sale, confirming the
> coupon correctly rejects a second redemption once its limit is hit,
> walking an `ONLINE` sale through `confirm → process → pack → ship →
> deliver` with no inventory movement past confirmation, applying a
> `PRODUCT`-scoped coupon that reduces only its matching line on a
> multi-line sale, and returning a discounted line for its correctly
> prorated (not full list price) refund — not just unit tests. Known gaps
> are documented, not silent — see `Docs/business-rules/` (no
> `Discount`/`Coupon` update/delete, no `PARTIALLY_SHIPPED` tracking or
> real courier integration, `FREE_SHIPPING` coupons compute a zero
> discount, purchase returns aren't discount-aware since purchases have no
> pricing engine).
>
> **Admin dashboard**: a browser UI now sits in front of the API — login,
> permission-gated navigation, and full screens for every module above
> (including lifecycle actions: stock transfer ship/receive, purchase
> confirm/receive/cancel, the full sales fulfillment pipeline, and a
> pricing quote simulator). Auth uses httpOnly session cookies translated
> to the API's `Authorization: Bearer` contract by a thin proxy layer
> (`app/api/proxy/v1/[...path]`, `proxy.ts`) — the API itself is unchanged
> and still enforces every permission check server-side. Built with
> Next.js Client Components, TanStack Query, react-hook-form (reusing the
> API's own zod schemas), and shadcn/ui. Verified via HTTP against the
> live database (not a real browser — this environment has no browser
> automation tool), so a manual click-through is still worth doing before
> relying on it.
>
> **Roles & Users**: tenants can now manage their own staff — `role`/`user`
> modules with a dashboard UI (`/roles`, `/users`). A role is a named,
> tenant-owned subset of the fixed platform `Permission` catalog
> (`RolePermission`); a user belongs to exactly one role. Verified live: a
> narrower "Cashier" role (only `SALE.VIEW`/`SALE.CREATE`) correctly
> receives just those two permissions on login and gets `403
> PERMISSION_DENIED` for anything else, and a role still assigned to a
> user can't be deleted until that user is reassigned or removed. See
> `Docs/business-rules/roles-and-permissions.md` for what's deliberately
> out of scope in v1 (no password-reset flow, no "last admin" delete
> guard).
>
> **Dashboard insights**: the dashboard home page now surfaces real
> business data instead of a placeholder — revenue, open sales/purchases,
> low-stock count, active coupons/discounts, sales-by-status and
> sales-by-channel charts, top products by revenue, and recent
> sales/purchases/low-stock tables — computed client-side
> (`lib/insights/compute-insights.ts`) from data the dashboard already
> fetches, with no new backend endpoints.
>
> **Warehouse-scoped users**: a user can now be restricted to a single
> warehouse (`User.warehouseId`) instead of acting tenant-wide — the
> intended shape for a mobile "Store Manager" login. Enforced the same way
> permissions are — checked fresh from the database on every request, not
> cached in the JWT — via `assertWarehouseAccess`/`assertWarehouseAccessAny`
> across warehouses, sales (+returns, including every lifecycle action —
> confirm/complete/cancel/process/pack/ship/deliver, not just create),
> purchases (+returns), inventory balances/adjustments, and stock transfers
> (which allow either side of the transfer to match the user's own store).
> Verified live: a user scoped to one warehouse can create a sale there but
> gets `403 PERMISSION_DENIED` at any other warehouse, and their list views
> are filtered to just their store. See
> [`Docs/MOBILE_API_GUIDE.md`](Docs/MOBILE_API_GUIDE.md) for the full
> endpoint-by-endpoint scoping matrix, aimed at an Android/mobile "Store
> Manager" client.
>
> **Super Admin**: a platform-level login (`/super-admin/login`) entirely
> independent of the tenant auth stack — its own `SuperAdmin` table (no
> `tenantId`), its own JWTs/cookies/proxy route, and its own dashboard
> (`/super-admin/tenants`, `/plans`, `/features`). Manages the Tenant
> lifecycle (create — which bootstraps that tenant's first Admin role and
> admin user — and change status between `TRIAL`/`ACTIVE`/`SUSPENDED`/
> `CANCELLED`), the Plan catalog, and the Feature catalog each plan can
> include. Verified live end-to-end: logged in as the seeded Super Admin
> (`root@platform.test`), created a Feature, a Plan referencing it, and a
> new Tenant referencing that Plan, then logged in as that tenant's
> bootstrapped admin through the completely ordinary `/login` flow and
> confirmed its permissions — while confirming the Super Admin's own
> session cookies are rejected by the tenant API and vice versa, proving
> the two auth stacks are truly independent. Out of scope for v1: no
> cross-tenant data access/impersonation, no tenant deletion, no
> finer-grained roles among platform staff (one flat Super Admin identity
> type).
>
> **GST taxation**: real, configurable Indian GST — a tenant-defined
> `TaxRate` catalog (`/tax-rates`, name + HSN/SAC + rate% + cess%) assigned
> per product with a tenant-wide default fallback, and a separate
> `ExtraCharge` catalog (`/extra-charges`, shipping/packing/handling —
> deliberately not tax) optionally taxable at one of those rates. Tax is
> computed server-side (`modules/pricing/service/tax.service.ts`) on the
> post-discount line total, splitting into CGST+SGST when the selling
> `Warehouse.state` (or the tenant's `homeState` fallback) matches the
> buyer's state (`Customer.state` for sales, `Supplier.state` for
> purchases — input tax credit reverses the seller/buyer roles), or a
> single IGST line when they differ, plus a separate CESS line if the rate
> has one — persisted per line as `SaleItemTax`/`PurchaseItemTax` rows, not
> just a flat total, so every invoice keeps its full component breakdown.
> `TenantSetting.taxInclusivePricing` resolves `pricing.md`'s long-open
> tax-inclusive-vs-exclusive decision — toggling it changes the
> taxable-value/tax split without changing the grand total. A `GET
> /sales|purchases/{id}` and its dashboard detail page now show that full
> breakdown plus attached charges and a running Subtotal → Discount →
> Taxable Value → Tax → Charges → Grand Total block; a new GST report
> (`/reports/gst`) shows output tax (sales) vs input tax (purchases) vs net
> payable for a date range, plus an HSN/rate-wise summary — the shape
> GSTR-1's HSN summary needs — and the main dashboard gets a "Net GST
> payable this month" tile. Verified live end-to-end: an 18% rate assigned
> to a product, a same-state sale correctly splitting into CGST 9% + SGST
> 9%, an inter-state sale on the same product instead producing a single
> IGST 18% line, a tax-inclusive toggle backing tax out of the price
> instead of adding it on top, a taxable Shipping charge computing its own
> tax correctly, and an inter-state purchase producing IGST on the input
> side. Out of scope for v1: GSTR-1/3B export or direct government portal
> filing, e-invoicing/e-way bills, reverse charge/composition
> scheme/TCS-TDS, per-warehouse separate GSTINs, HSN-rate auto-lookup
> against a government master list. A line's tax is snapshotted at
> creation and never retroactively recomputed if its `TaxRate` changes
> later — same rule `SaleDiscount` already follows.
>
> **Product catalog images**: products can now have a photo gallery (up to
> 8 images each), stored in Cloudinary rather than on local disk or in the
> database (see `shared/utils/cloudinary.ts` for why, and for the cheaper
> alternatives that were considered). Uploads go through this app's own
> authenticated `POST /products/{id}/images` route — never Cloudinary's
> client-side upload widget — so the existing `PRODUCT.UPDATE` permission
> check still applies; Cloudinary only ever sees the API's own server-side
> upload, never a request straight from the browser. The lowest `sortOrder`
> image is the primary/thumbnail, changeable without reordering the whole
> list (`modules/product/service/product-image.service.ts`'s `makePrimary`
> swaps `sortOrder` with the current primary). Requires a free Cloudinary
> account — see the `CLOUDINARY_*` variables below; without them, upload
> requests fail but the rest of the app is unaffected.

## Technology Stack

- [Next.js](https://nextjs.org/) (App Router) + [React](https://react.dev/)
- TypeScript (strict mode)
- [Prisma ORM](https://www.prisma.io/) + MySQL
- Tailwind CSS
- Zod (validation)
- JWT authentication

## Prerequisites

- Node.js 20+
- A running MySQL instance (local, Docker, or hosted)

## Installation

```bash
npm install
```

Generating the Prisma client isn't wired to `postinstall` yet — run it once
after installing (and again any time `prisma/schema.prisma` changes):

```bash
npx prisma generate
```

## Environment Setup

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable       | Purpose                                      |
| -------------- | --------------------------------------------- |
| `DATABASE_URL` | MySQL connection string used by Prisma        |
| `JWT_SECRET`   | Signing secret for auth tokens                |
| `JWT_EXPIRES_IN` | Access token lifetime (e.g. `15m`)          |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime (e.g. `7d`)  |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account — product catalog images (`shared/utils/cloudinary.ts`) |
| `CLOUDINARY_API_KEY` | Cloudinary account — same as above |
| `CLOUDINARY_API_SECRET` | Cloudinary account — same as above |

## Database

Prisma 7 doesn't read the connection string from `schema.prisma` — the CLI
(migrate/studio) reads it from `prisma.config.ts`, and the runtime
`PrismaClient` connects through a driver adapter
(`@prisma/adapter-mariadb`) instead — see
[`Docs/DATABASE.md`](Docs/DATABASE.md) -> Prisma 7 Driver Adapters and
[`shared/database/prisma.ts`](shared/database/prisma.ts). Both read
`DATABASE_URL` from `.env`, so setting it once is enough.

```bash
npx prisma migrate dev --name init   # create the schema
npm run db:seed                      # demo tenant + admin user + warehouse (idempotent)
```

The seed creates a login-ready account:

```text
tenantCode: demo
email:      admin@demo.test
password:   Password123!
```

See [`Docs/DATABASE.md`](Docs/DATABASE.md) for schema design rationale and
[`prisma/schema.prisma`](prisma/schema.prisma) for the full table
definitions.

## Folder Overview

```text
app/            Next.js App Router — API routes only so far (app/api/v1/**), thin, no business logic
modules/        Business domains — auth, tenant, product, warehouse, inventory, supplier, purchase, customer, sales
shared/         Cross-cutting code — database, auth (JWT), middleware (request pipeline), errors, utils, validation
prisma/         Database schema (schema.prisma), migrations, seed.ts
Docs/           Architecture, module guide, API standards, database design, business rules, ADRs
AI_AGENT.md     Mandatory rules for AI coding agents working in this repo
AGENTS.md       Agent-tooling entry point (imported by CLAUDE.md)
MODULES.md      Module structure rules (superseded by Docs/MODULE_GUIDE.md for the how-to checklist)
DATABSE.md      Original database draft (superseded by Docs/DATABASE.md)
```

## Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). There's no UI yet —
this is API-only; hit `app/api/v1/**` directly (see
[`Docs/API_STANDARDS.md`](Docs/API_STANDARDS.md)) or start with
`POST /api/v1/auth/login` using the seeded demo account above.

## Testing

```bash
npm test          # run once
npm run test:watch
```

Every service is unit-tested with the repository layer mocked (see any
`modules/*/tests/*.test.ts`) — fast, no database required. There is no
integration test suite yet; the full stack has been exercised manually
end-to-end against a real database instead (login → catalog → purchase →
receive → sell → cancel), not automated as a repeatable test.

## Deployment

Not yet configured. When ready, target any Node-compatible host (Vercel,
a container platform, etc.) with `DATABASE_URL`/`JWT_SECRET` set as
environment variables and `npm run build && npm run start` as the deploy
command.

## Documentation

| File                                                     | Purpose                                    |
| --------------------------------------------------------- | ------------------------------------------- |
| [`AI_AGENT.md`](AI_AGENT.md)                             | Mandatory architecture/coding rules (AI agents) |
| [`Docs/ARCHITECTURE.md`](Docs/ARCHITECTURE.md)           | System design, request pipeline, multi-tenancy |
| [`Docs/MODULE_GUIDE.md`](Docs/MODULE_GUIDE.md)           | How to create/structure a module            |
| [`Docs/API_STANDARDS.md`](Docs/API_STANDARDS.md)         | REST conventions, response envelope, error codes |
| [`Docs/MOBILE_API_GUIDE.md`](Docs/MOBILE_API_GUIDE.md)   | Android/mobile integration: bearer-token auth, warehouse scoping, Store Manager endpoints |
| [`Docs/DATABASE.md`](Docs/DATABASE.md)                   | Schema design decisions, indexing, scaling  |
| [`Docs/CONTRIBUTING.md`](Docs/CONTRIBUTING.md)           | Branch strategy, PR/review checklist        |
| [`Docs/business-rules/`](Docs/business-rules/)           | Inventory, purchase, sales, pricing, taxation rules |
| [`Docs/decisions/`](Docs/decisions/)                     | Architecture decision records (ADRs)        |
