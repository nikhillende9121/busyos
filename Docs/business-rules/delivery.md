# Business Rules — Delivery / Fulfillment

## A Sale Doesn't Need a Shipment

`Shipment` only applies to sales that require physical delivery — a POS
walk-out sale never gets one. Whether a given `ONLINE`/`MARKETPLACE` sale
needs one is a property of how the tenant fulfills orders (ship vs.
in-store pickup), not assumed automatically from `channel` alone.

## Provider Selection Is Per-Tenant, Not Hardcoded

Which courier handles a shipment is resolved from the tenant's
`TenantDeliveryConfig` (see `DATABASE.md`), not a global default. A tenant
with no enabled provider and no manual/in-house fulfillment configured
should fail fast with a clear error at shipment-creation time, not fall back
silently to some other tenant's provider or a hardcoded courier.

## Webhook Idempotency

Delivery providers redeliver webhooks on timeout — the same event (e.g.
"package delivered") may arrive more than once. Webhook handlers must
dedupe by the provider's event id (or via the shared `IdempotencyKey`
mechanism) before applying a `Shipment.status` transition — applying the
same terminal-state transition twice must be a no-op, not an error and not a
duplicate side effect (e.g. double-notifying the customer).

## Status Cascade Is One-Directional

`Shipment.status` reaching a terminal state (`DELIVERED`, `FAILED`,
`RETURNED`) updates the parent `Sale.status`. The reverse never happens —
changing a `Sale.status` manually (e.g. an admin cancelling an order) does
not silently rewrite `Shipment.status`; it must explicitly call the courier's
cancel API through the `DeliveryProviderAdapter` (see `ARCHITECTURE.md`) and
let the resulting webhook (or an immediate synchronous response) drive the
`Shipment.status` update.

## Multiple Shipments Per Sale

A single `Sale` can have more than one `Shipment` (split shipment across
warehouses, or a rebooked shipment after a failed delivery attempt) — never
assume a 1:1 relationship when building fulfillment UI or reports.
