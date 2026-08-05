# 0005: Price Lists (not a single price column) + Scoped Discounts/Coupons

## Status

Accepted and implemented in `prisma/schema.prisma`
(`PriceList`/`PriceListItem`, `CustomerGroup`, `Discount`/`DiscountProduct`/
`DiscountCategory`, `Coupon`/`CouponProduct`/`CouponCategory`/
`CouponRedemption`, `SaleDiscount`).

## Context

`pricing.md` originally flagged "single price vs. price list" as an open
decision blocking the Sales module. The concrete requirement has since been
confirmed: the same product must be able to sell for a different price at
different stores (`Warehouse`s) within one tenant, and a specific customer
(or customer tier) may have negotiated pricing regardless of store.
Separately, promotions need to apply at store, customer, product, or
category granularity, through both automatic discounts and customer-entered
coupon codes.

## Decision

- Model selling price as **`PriceList` + `PriceListItem`**, scoped by
  optional `warehouseId`, `customerGroupId`, and `customerId` (in that order
  of specificity — see `pricing.md` → Price Resolution Order), instead of a
  `price` column on `Product`.
- Introduce **`CustomerGroup`** as the default unit for customer-tier pricing
  and discounts, with `PriceList.customerId` / `Discount.customerId` reserved
  for genuine one-off exceptions rather than the common case.
- Model **`Discount`** (automatic) and **`Coupon`** (code-redeemed) as two
  separate entities sharing the same scope shape (`warehouseId`,
  `customerGroupId`, many-to-many product/category join tables), because
  their triggering and usage-tracking semantics genuinely differ.
- Record every applied discount/coupon amount on a `SaleDiscount` /
  `CouponRedemption` row at time of sale, independent of the live
  `Discount`/`Coupon` definition.

## Consequences

- Adding a new store-specific price, or a new customer group's pricing,
  is a new `PriceList` row — no schema migration, no new column per store.
  This is what lets the platform scale to many stores per tenant without the
  pricing model degrading.
- The sales/pricing service layer carries real resolution logic (walking
  specificity tiers, checking stacking rules) — this is a deliberate
  trade-off of schema simplicity for service-layer complexity, consistent
  with `0004`'s trade-off for channel-aware `Sale` status transitions.
- Coupon redemption limits require transactional, race-safe enforcement
  (same concurrency pattern as inventory stock-sufficiency checks in
  `0002-shared-database.md`'s tenant-isolation discipline) — a naive
  check-then-write is a known overselling bug under concurrent checkouts.
- Explicitly deferred, not designed speculatively: multi-coupon stacking,
  line-item-level return proration (needed for correct refunds under a
  discount — see `discounts-and-coupons.md` → Returns), and the
  currency/tax-inclusivity decisions `pricing.md` still lists as open. These
  should not block implementing the schema above, but must be resolved
  before the Sales module computes a final checkout total.

## Follow-up

Schema implemented. Still open, and must be resolved before the Sales
module computes a final checkout total: multi-coupon stacking (deferred by
design), line-item-level return proration, and the currency/tax-inclusivity
decisions `pricing.md` still lists as open.
