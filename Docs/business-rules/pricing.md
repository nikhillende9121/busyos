# Business Rules — Pricing

## Status

Implemented end-to-end: schema (`PriceList`, `PriceListItem`,
`CustomerGroup`), full CRUD for `CustomerGroup`, create/list/get for
`PriceList` (no update/delete yet — see below), and the resolution
algorithm as `modules/pricing/repository/price-list.repository.ts ->
resolve()`, exposed via `GET /api/v1/pricing/resolve`. `Product`
deliberately has no price column — see Design, below. This document is the
resolved design for base selling price; `discounts-and-coupons.md` covers
promotional price reductions on top of it. See
`Docs/decisions/0005-multi-level-pricing-and-promotions.md` for the ADR.

`PriceList` update/delete are deliberately deferred: deleting one needs a
"never remove the last tenant-wide default" guard that isn't implemented
yet. Until then, price lists are effectively append-only — correct a
mistake by creating a new one, not editing/removing the old one.

## Requirement

A tenant can run multiple stores (`Warehouse`), and the same product can
legitimately sell for a different price at different stores — plus a
tenant may negotiate a different price for a specific customer (wholesale
account, contract pricing) regardless of which store they buy from.

## Design: Price Lists, Not a Single Price Column

Reject a single `price` column on `Product` — it cannot express "different
price per store" or "different price per customer" without becoming a wide
table of nullable per-store columns that doesn't scale past a handful of
stores. Instead:

```text
PriceList            — a named, scoped set of prices
  ├── tenantId        (always scoped to one tenant)
  ├── warehouseId?    (null = applies across all stores)
  ├── customerGroupId?(null = applies to all customer groups)
  ├── customerId?     (null = not a per-customer override; set = one specific customer)
  ├── currency
  ├── startDate / endDate?
  └── PriceListItem[] — (productId, price, minQuantity)
```

`PriceListItem.minQuantity` (default 1) is included now, not retrofitted
later, so tiered quantity pricing ("₹100/unit under 10, ₹90/unit at 10+") is
representable without a schema change when that requirement inevitably
comes up.

## Customer Groups, Not Per-Customer Rows by Default

"Customer-level pricing" should mean **customer *group*-level** (e.g. Retail,
Wholesale, VIP) for the common case — a new `CustomerGroup` entity
(`tenantId`, `name`, `code`), with `Customer.customerGroupId` (nullable).
Modeling every negotiated price as one row per individual `Customer` doesn't
scale past a few hundred customers with custom pricing; a group absorbs the
common case, and `PriceList.customerId` still exists for the genuine
one-off exception (a single strategic account with a truly unique contract
price).

## Price Resolution Order

For a given `(tenant, warehouse, customer, product, quantity)`, evaluate
candidate `PriceList`s and pick the **most specific match**, in this order
(first match wins):

```text
1. customerId match           (this exact customer, regardless of store)
2. warehouseId + customerGroupId match   (this store, this customer's group)
3. warehouseId match           (this store, any customer)
4. customerGroupId match       (any store, this customer's group)
5. tenant default              (warehouseId = null, customerGroupId = null, customerId = null)
```

Within whichever `PriceList` is selected, pick the `PriceListItem` with the
largest `minQuantity` that is `<= requested quantity`. A tenant must always
have exactly one default `PriceList` (tier 5) per active currency — the
service layer should refuse to let the last default list be deleted or
deactivated, since every product needs a fallback price.

## Open Decisions (still unresolved)

- **Currency**: `tenant_settings.currency` is a display setting today.
  Multi-currency *transactions* (a `PriceList` already carries `currency`
  above, anticipating this) still need a decision on exchange-rate handling
  before `PurchaseItem`/`SaleItem` gain a currency field.
- **Tax-inclusive vs. tax-exclusive pricing**: whether `PriceListItem.price`
  already includes tax, or tax is always additive on top — must be a single
  tenant-wide rule. This interacts with discount computation order — see
  `discounts-and-coupons.md` — and should be decided together with it, not
  independently.
