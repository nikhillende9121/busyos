# 0004: One `Sale` Entity Across Channels; Delivery via Pluggable Adapters

## Status

Accepted.

## Context

Adding POS (Android terminal) and online/marketplace ordering raised two
open design questions:

1. Should online orders be a separate `Order` table from in-person `Sale`
   records, given they need richer fulfillment statuses (payment pending,
   packed, shipped, delivered) that a POS sale never uses?
2. How should third-party courier integration (Shiprocket, Delhivery, Dunzo,
   in-house delivery) be modeled so each tenant can plug in their own
   provider without a code change per courier?

## Decision

**One `Sale` entity, discriminated by `channel`.** `SaleStatus` is a superset
of every channel's states; the sales service validates transitions against
the sale's own `channel` rather than exposing a status machine with dead
states. `terminalId`/`cashSessionId` are nullable POS-only attribution
columns on the same table, not a parallel `PosSale` entity.

**Delivery via a `DeliveryProviderAdapter` interface**, one implementation
per courier, selected per-tenant through `TenantDeliveryConfig`. A `Shipment`
row links a `Sale` to whichever provider fulfilled it.

## Consequences

- Reporting/analytics ("total sales this month") never has to `UNION` across
  two tables — every revenue-generating transaction, regardless of channel,
  is one `Sale` row.
- The sales service carries the responsibility of enforcing per-channel valid
  transitions (a POS sale reaching `PACKED` would be a service-layer bug, not
  prevented by the schema itself) — this is a deliberate trade of schema
  simplicity for service-layer validation discipline.
- A new courier is "write one adapter class implementing the existing
  interface" — no changes to `SalesService` or any other caller, following
  the same public-service-boundary principle as `0001-modular-architecture.md`.
- Courier credentials are tenant-owned secrets (`TenantDeliveryConfig.credentialsEncrypted`)
  encrypted at rest — a credential leak from one tenant's config must never
  expose another tenant's courier account.
- If a future channel needs fundamentally different data (not just a status
  subset — e.g. a marketplace order needing a commission/settlement field no
  other channel has), add nullable channel-specific columns to `Sale` first;
  only fork into a separate table if that channel's shape diverges enough
  that most `Sale` columns would be null for it.
