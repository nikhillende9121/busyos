# DATABASE.md

Audience: backend developers. This is the canonical database reference —
supersedes the draft in root `DATABSE.md`. The **actual source of truth for
columns and types** is [`prisma/schema.prisma`](../prisma/schema.prisma);
this document explains the *decisions behind* that schema, which a `.prisma`
file can't carry as comments alone.

---

## Table Tiers

| Tier      | Has `tenant_id`? | Managed by   | Examples                                   |
| --------- | ---------------- | ------------ | ------------------------------------------- |
| System    | No                | Super Admin  | `plans`, `features`, `permissions`           |
| Tenant    | Is the tenant     | Tenant Admin | `tenants`, `tenant_settings`, `tenant_subscriptions` |
| Business  | Yes               | Tenant users | `products`, `purchases`, `sales`, `inventory_*` |

## ID Strategy

All primary keys are `BigInt @default(autoincrement())`, not UUID/CUID.

Why: at the target scale (millions of products, high-write ledgers), a
monotonically increasing integer PK keeps InnoDB's clustered index
sequential — inserts append to the end of the index instead of scattering
writes across random pages, which is what a UUID primary key would do. The
trade-off is that raw IDs are guessable/enumerable; anywhere an ID is
exposed to an end user in a URL (e.g. a public tracking link), generate a
separate opaque token rather than switching the whole table's PK strategy.

## Multi-Column Uniqueness Is Tenant-Scoped, Not Global

`sku` and `barcode` are unique **per tenant**, not globally:

```prisma
@@unique([tenantId, sku])
@@unique([tenantId, barcode])
```

Two different tenants can legitimately use the same SKU. A global unique
constraint on `sku` alone would be a bug, not a safety feature.

## Index Strategy

Every business table indexes `tenant_id` alone (cheap tenant-scoped scans)
plus composite indexes matching the query patterns the module layer actually
runs:

```text
tenant_id + sku            products      (lookup by SKU within tenant)
tenant_id + barcode        products      (barcode scan lookup)
tenant_id + warehouse_id   inventory_*   (stock queries per warehouse)
tenant_id + status         purchases, sales (list/filter by status)
created_at                 inventory_transactions, audit_logs (time-range queries)
```

Composite index column order matters: `tenant_id` first because it's in
*every* query's `WHERE` clause, so it's the most selective shared prefix.

## Soft Delete

`deletedAt DateTime?` on entities a tenant expects to recover: `products`,
`categories`, `brands`, `warehouses`, `customers`, `suppliers`, `users`,
`purchases`, `sales`, `roles`, `tenants`. Repositories must filter
`deletedAt: null` by default and expose an explicit "include deleted"
parameter for admin/restore flows — never a bare `findMany()` with no
deletion filter.

Ledger tables (`inventory_transactions`, `audit_logs`) have **no** soft
delete — they are never deleted, soft or hard. A correction is a new row,
never a mutation of an old one.

## Audit Columns

`createdBy` / `updatedBy` are plain, unenforced `BigInt?` columns — not
Prisma relations to `User`. Enforcing a foreign key here would require every
table to declare a named relation to `User` (Prisma requires unique relation
names when multiple relations target the same model), and creates a
bootstrapping problem: the first `User` row has no other user to be its
`createdBy`. These columns are for audit trail readability, not referential
integrity — referential integrity for "who did this" lives in `audit_logs`,
which does enforce a real FK to `User`.

## Transactions

The following must run inside a single Prisma `$transaction`, never as
separate sequential writes:

- Purchase confirmation → `PurchaseItem` writes + `InventoryTransaction`
  (PURCHASE_IN) + `InventoryBalance` update.
- Sale confirmation → `SaleItem` writes + `InventoryTransaction` (SALE_OUT) +
  `InventoryBalance` update, with a stock-sufficiency check inside the same
  transaction (not a pre-check outside it — otherwise two concurrent sales
  can both pass a pre-check against the same stale balance).
- Stock adjustment / transfer → ledger entry + balance update on both the
  source and destination warehouse (for transfers).
- Payment posting → `Payment` row + any status transition it triggers on the
  parent `Purchase`/`Sale`.

## Partitioning Plan (future, not yet applied)

`inventory_transactions` and `audit_logs` are designed as append-only,
ever-growing ledgers. Prisma's schema DSL has no `PARTITION BY` construct, so
when either table's row count starts affecting query latency (a concrete
threshold to revisit, not a number to guess now):

1. Apply MySQL `RANGE` partitioning on `created_at` (e.g. monthly partitions)
   via a raw SQL migration — Prisma will keep working against the table
   unchanged, since partitioning is transparent to the query layer.
2. Consider archiving partitions older than the tenant's reporting window to
   cold storage.

Do not partition speculatively before there's a measured need — it adds
operational complexity (partition maintenance jobs) that isn't justified at
low volume.

## Read Scaling (future)

When reporting/dashboard queries start contending with transactional writes,
introduce a MySQL read replica and route read-only aggregate queries (e.g.
"total sales this month across all warehouses") to it. This requires no
schema change — only a second Prisma datasource/connection routed to the
replica for specific repository methods.

## Foreign Key Rules

Always use foreign keys; never store an orphaned reference. `onDelete`
behavior follows the relationship's real-world meaning:

- `Cascade` where the child is meaningless without the parent (e.g.
  `PurchaseItem` → `Purchase`).
- `Restrict` where deleting the parent while children exist should be an
  error, not a silent cascade (e.g. can't delete a `Supplier` with existing
  `Purchase` history — cancel/soft-delete instead).
- `SetNull` where the relationship is optional context (e.g. `Product` →
  `Category`; deleting a category shouldn't delete its products).

## POS: Terminals & Cash Sessions

`Terminal` (a registered POS device/register, one per `Warehouse`) and
`CashSession` (one cashier shift on a terminal: opening float → sales →
closing count/variance) exist for end-of-shift cash reconciliation, a
standard POS requirement with no equivalent in a pure online-order flow.
Both are referenced from `Sale` as nullable FKs (`terminalId`,
`cashSessionId`) — populated for `channel: POS` sales, always null for
`ONLINE`/`MARKETPLACE` sales. See `ARCHITECTURE.md` → Sales Channels.

## Idempotency

`IdempotencyKey` is shared infrastructure, not owned by any business module —
it exists so a retried request (an Android POS device replaying a queued
sale after reconnecting, or a delivery provider redelivering a webhook after
a timeout) doesn't execute the underlying write twice. Middleware looks up
`(tenantId, key)` before the request reaches a controller and replays the
stored `responseBody`/`statusCode` on a repeat instead of re-running the
service call. `requestHash` guards against the same key being reused for a
genuinely different request body (a client bug, not a legitimate retry).
Rows expire (`expiresAt`) and should be purged by a scheduled job — this
table is a short-lived dedup cache, not an audit log.

## Delivery / Fulfillment Integration

`DeliveryProvider` is a system catalog (no `tenant_id`) of couriers the
platform knows how to integrate with. Each tenant opts in per-provider via
`TenantDeliveryConfig`, which holds *that tenant's* encrypted credentials —
never the platform's — so two tenants can each connect their own Shiprocket
account without collision. `credentialsEncrypted` must never be stored or
logged in plaintext; encrypt/decrypt through a `shared/security/` helper, not
inline in the delivery module.

`Shipment` links one `Sale` to the provider handling it, plus tracking
number/status/cost. A sale can have more than one `Shipment` over its
lifetime (e.g. a failed first attempt rebooked with a different provider) —
that's why the relation is `Sale.shipments: Shipment[]`, not a single nullable
FK on `Sale`.

## Pricing & Promotions

Selling price is never a column on `Product` — it's resolved from
`PriceList`/`PriceListItem`, scoped by `warehouseId` (per-store price),
`customerGroupId` (tier pricing), or `customerId` (a specific negotiated
exception). `CustomerGroup` is the default unit for "customer-level"
pricing/discounts — modeling every negotiated price as one row per
individual `Customer` doesn't scale past a few hundred custom-priced
accounts. See `Docs/business-rules/pricing.md` for the full resolution
order and a worked example.

`Discount` (automatic) and `Coupon` (code-redeemed, tracked via
`CouponRedemption`) share the same scope shape (`warehouseId`,
`customerGroupId`, `customerId`, plus many-to-many `DiscountProduct`/
`DiscountCategory`/`CouponProduct`/`CouponCategory` join tables) but are
separate models because only `Coupon` needs redemption-count enforcement.
`usageLimitTotal`/`usageLimitPerCustomer` must be checked by counting
`CouponRedemption` rows inside the same transaction as the `Sale` write —
the same race-condition risk as the inventory stock-sufficiency check (see
Transactions, above): a check-then-write done as two separate steps lets a
limited coupon be oversold under concurrent checkouts.

`SaleDiscount` records what was actually applied to a sale (line-level via
`saleItemId`, or order-level when null) independent of the live
`Discount`/`Coupon` definition, so a later edit to a promotion's value never
rewrites what a past sale actually charged. See
`Docs/business-rules/discounts-and-coupons.md` for stacking rules and order
of operations.

## Full Schema

See [`prisma/schema.prisma`](../prisma/schema.prisma) for every model, field,
enum, and constraint. Run `npx prisma studio` locally to browse the schema
visually once the database is provisioned.
