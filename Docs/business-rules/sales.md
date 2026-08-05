# Business Rules — Sales

## Lifecycle Is Channel-Dependent

`Sale.channel` (`POS` / `ONLINE` / `MARKETPLACE` / `PHONE`) determines which
subset of `SaleStatus` a given sale actually passes through — see
`Docs/ARCHITECTURE.md` → Sales Channels. A POS sale should never sit in
`PENDING_PAYMENT` or `PACKED`; an online order should never skip straight
from `PENDING_PAYMENT` to `COMPLETED`. The service layer must validate
transitions against the sale's own `channel`, not accept any `SaleStatus`
value for any channel.

```text
POS:      DRAFT → CONFIRMED → COMPLETED
                          ↘ CANCELLED (only from DRAFT or CONFIRMED)

ONLINE:   PENDING_PAYMENT → CONFIRMED → PROCESSING → PACKED → SHIPPED → DELIVERED
                          ↘ CANCELLED (only before SHIPPED)
```

Implemented as `confirm()` (both channels' shared transition into
`CONFIRMED`), `complete()` (POS-only: `CONFIRMED → COMPLETED`), and four
explicit online-only steps `process()`/`pack()`/`ship()`/`deliver()`, each
checking its own required prior status rather than one generic "advance"
call — an out-of-order request (e.g. shipping before packing) fails
clearly instead of silently skipping a step. `complete()` rejects a
non-POS sale; `process()`/`pack()`/`ship()`/`deliver()` reject a POS sale.

Not implemented in this v1, and flagged rather than silently dropped:
`PARTIALLY_SHIPPED` (per-item partial shipment tracking, mirroring
`Purchase`'s `receivedQuantity` — no equivalent field exists on `SaleItem`
for "shipped so far"), and creating an actual `Shipment`/`DeliveryProvider`
record when `ship()` runs (see `Docs/ARCHITECTURE.md` → Delivery
Integration for the intended adapter pattern) — `ship()` today only
advances `Sale.status`, it doesn't talk to a courier.

## Inventory Impact Timing

Stock decreases on **confirmation** (or shipment, if the tenant's workflow
distinguishes "confirmed" from "physically shipped" — a decision for the
Sales module's implementation), not on `DRAFT` creation. The
insufficient-stock check and the `SALE_OUT` ledger write must happen inside
the same database transaction — see `DATABASE.md` → Transactions for why a
pre-check outside the transaction is a race condition under concurrent
sales.

## Cancellation

Cancellable from any status before `SHIPPED` (`DRAFT`, `PENDING_PAYMENT`,
`CONFIRMED`, `PROCESSING`, `PACKED`) — once stock has left
(`CONFIRMED`/`PROCESSING`/`PACKED`, all after confirmation and before
shipping), cancelling must generate a reversing `SALE_RETURN`-style ledger
entry to restore the balance — never a silent balance edit. Once `SHIPPED`
or later, cancellation isn't offered at all; use a `SaleReturn` instead —
the goods are already (or about to be) in the customer's hands, so "cancel"
no longer describes what's happening.

## Sale Returns

A `SaleReturn` generates an inbound (`SALE_RETURN_IN`) ledger entry and a
discount-aware refund amount — see `Docs/business-rules/sale-return.md` —
subject to whatever return-window policy the tenant configures (not yet
modeled — add a `returnWindowDays` setting to `tenant_settings` when this
is built).

## Pricing

See `pricing.md` for how `SaleItem.price` is determined per customer/tenant.
