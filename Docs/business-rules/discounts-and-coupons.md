# Business Rules — Discounts & Coupons

## Status

Implemented end-to-end: schema (`Discount`, `DiscountProduct`,
`DiscountCategory`, `Coupon`, `CouponProduct`, `CouponCategory`,
`CouponRedemption`, `SaleDiscount`), the resolution engine
(`modules/pricing/service/promotion.service.ts` — `quote()` for a
side-effect-free preview, `applyQuoteToSale()` for the persisting,
race-safe commit path), and integration into `modules/sales` via an
optional `couponCode` on sale creation. Builds on top of the base-price
design in `pricing.md` — read that first. See
`Docs/decisions/0005-multi-level-pricing-and-promotions.md` for the ADR.

`PRODUCT`/`CATEGORY`-scoped coupons are supported — see PRODUCT/CATEGORY
Coupon Scope, below. Known gaps still remaining: `Coupon`/`Discount` CRUD
has create/list/get only (no update/delete yet); `FREE_SHIPPING` coupons
compute a zero line-total discount (shipping isn't modeled at all yet); a
return's refund is discount-aware (see `sale-return.md` → Discount-Aware
Refunds) but a *purchase* return still refunds/reverses at full line price
(purchases don't go through a pricing/discount engine at all). All flagged
in code, not silent.

## PRODUCT/CATEGORY Coupon Scope

A `PRODUCT`/`CATEGORY`-scoped coupon behaves like a scoped `Discount`: it
reduces only the line(s) it matches, computed the same way (percentage of
the running amount, or flat, capped by `maxDiscountAmount`, never exceeding
what's left on that line) — not the whole order. An `ORDER`-scope coupon is
still the only kind applied once, to the whole order's total.

A `PRODUCT`/`CATEGORY`-scoped coupon that matches **no line** in the order
is rejected outright (`VALIDATION_ERROR`) — a customer entering a code that
doesn't apply to anything they're buying should get a clear rejection, not
a silent no-op discount of zero.

`minPurchaseAmount` is still checked against the whole order's pre-discount
subtotal regardless of the coupon's scope — a line-scoped coupon's minimum
spend requirement is about the *order* qualifying, not just the matched
line.

## Two Distinct Mechanisms, Not One

- **Discount** — an automatic rule the system applies with no customer
  action ("10% off Category X at Store Y this weekend").
- **Coupon** — a customer-entered code, individually redeemed and tracked
  per redemption, with usage limits.

Both share the same *scope* model (what they apply to) but differ in how
they're triggered and how usage is tracked — modeled as two separate tables,
not one table with a nullable "code" column, because their lifecycle and
constraints (redemption counting, per-customer usage limits) genuinely
differ.

## Scope: Store / Customer / Product / Category

Both `Discount` and `Coupon` share the same optional scoping columns —
any combination may be set; a match requires **all set columns to match**,
absent columns mean "applies regardless":

```text
warehouseId?      — null = all stores; set = one specific store only
customerGroupId?  — null = all customers; set = one customer group only
```

Product/category scope is many-to-many (a single promotion can target
several products or a whole category), via join tables:

```text
DiscountProduct   (discountId, productId)
DiscountCategory  (discountId, categoryId)
CouponProduct     (couponId, productId)
CouponCategory    (couponId, categoryId)
```

If a `Discount`/`Coupon` has no rows in either join table, its `scope` field
(`ORDER` / `PRODUCT` / `CATEGORY`) determines whether it's cart-wide or would
require product/category rows to mean anything — `scope = PRODUCT` with zero
`DiscountProduct` rows is a configuration error, not "applies to nothing
silently."

## Discount

```text
Discount
  tenantId, name
  type            PERCENTAGE | FLAT
  value           Decimal
  scope           ORDER | PRODUCT | CATEGORY
  warehouseId?    customerGroupId?
  minPurchaseAmount?   maxDiscountAmount?   (cap for PERCENTAGE)
  startDate, endDate?
  isActive
  stackable       Boolean  (see Stacking Rules below)
  priority        Int      (lower runs first when multiple stackable discounts apply)
```

## Coupon

Same scoping shape as `Discount`, plus redemption controls:

```text
Coupon
  tenantId, code            (unique per tenant, not globally)
  type            PERCENTAGE | FLAT | FREE_SHIPPING
  value
  scope, warehouseId?, customerGroupId?, [CouponProduct/CouponCategory rows]
  minPurchaseAmount?   maxDiscountAmount?
  usageLimitTotal?          (overall redemption cap across all customers)
  usageLimitPerCustomer?    (e.g. "once per customer")
  startDate, endDate?, isActive, stackable

CouponRedemption
  couponId, tenantId, customerId?, saleId
  amountDiscounted   Decimal   (actual amount discounted on this specific sale)
  redeemedAt

  @@unique([couponId, saleId])   -- a coupon is redeemed at most once per sale
```

`CouponRedemption` exists so redemption *history* survives a later edit to
the `Coupon` definition (changing `value` after the fact must not rewrite
what a past sale actually paid), and so `usageLimitTotal` /
`usageLimitPerCustomer` can be enforced by counting rows rather than trusting
a mutable counter that can drift from reality.

## Concurrency: Redemption Limits Must Be Race-Safe

Checking `usageLimitTotal` and inserting the `CouponRedemption` row must
happen inside the same database transaction as the `Sale` write (same
principle as the stock-sufficiency check in `inventory.md`) — a limited
100-use coupon checked-then-inserted as two separate steps can be redeemed
more than 100 times under concurrent checkouts. Enforce it as a single
conditional write (e.g. insert-then-count-check inside the transaction, or a
`SELECT ... FOR UPDATE` on the `Coupon` row) that fails the whole sale
transaction if the limit is already reached.

## Applying Discounts/Coupons: Order of Operations

For a given sale, at checkout:

```text
1. Resolve base price per line item          (pricing.md price resolution)
2. Apply automatic Discounts                 (0 or more, per Stacking Rules)
3. Apply at most one Coupon                  (v1: one coupon per order — see below)
4. Compute tax on the resulting line total    (per pricing.md's tax-inclusive/exclusive decision)
```

`minPurchaseAmount` on a `Discount`/`Coupon` is checked against the
**pre-discount** subtotal — checking it post-discount would let a customer
apply one discount to artificially clear another promotion's minimum
threshold.

## Stacking Rules

- **Non-stackable** (`stackable = false`, the default): if more than one
  non-stackable `Discount` matches the same line item, only the single
  highest-value one applies — they never combine.
- **Stackable** (`stackable = true`): multiple stackable discounts apply
  **sequentially**, each computed off the *running* (already-discounted)
  amount, in ascending `priority` order — not all computed off the original
  price and summed. Sequential application guarantees the final price can
  never go negative or below zero even if discount percentages would sum
  past 100%; summing raw percentages does not have that guarantee.
- **Coupons**: v1 supports **exactly one coupon per order**. Allowing
  multiple stacked coupon codes is a common target for abuse (stacking
  unrelated promo codes) and is deliberately deferred rather than designed
  speculatively — revisit only if a real business need for coupon stacking
  emerges.

## Auditability

Every discount/coupon amount actually applied to a `Sale` is recorded on a
`SaleDiscount` row (`saleId`, `discountId?`, `couponId?`, `amount`) at the
time of sale — never recomputed later from the live `Discount`/`Coupon`
definition, which may since have changed or been deleted. Historical sales
must remain reproducible from their own recorded data, same principle as the
append-only `inventory_transactions` ledger.

## Applying at Creation vs. Confirmation

The coupon (if any) is validated, redeemed, and its `SaleDiscount`/
`CouponRedemption` rows written at **sale creation**, not at `confirm`. This
is a deliberate tradeoff, not an oversight: it keeps the coupon logic in one
place (no need to carry a `couponCode` field on `Sale` between the two
steps) at the cost that an abandoned `DRAFT`/`PENDING_PAYMENT` sale
(customer never confirms) still consumes one redemption of a limited-use
coupon. Revisit only if abandoned-cart coupon leakage becomes a real
problem — likely paired with an abandoned-`DRAFT`-sale expiry job, which
doesn't exist yet either.

## Returns

`SaleReturn` now refunds the proportional *discounted* amount (from
`SaleDiscount`), not the item's undiscounted list price — see
`Docs/business-rules/sale-return.md` → Discount-Aware Refunds for the
proration formula. `PurchaseReturn` has no equivalent concern: purchases
don't go through a pricing/discount engine at all, so a purchase return's
reversal at the original line price is already correct as-is.
