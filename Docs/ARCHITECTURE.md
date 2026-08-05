# ARCHITECTURE.md

Audience: architects and senior developers. This document is **descriptive** — it
explains how the system works. The **prescriptive** rules an AI agent or developer
must follow are in `AI_AGENT.md` (root) and must not be duplicated here.

---

## High-Level Design

```text
Browser / Client
      │
      ▼
Next.js App Router (UI + API Routes)
      │
      ▼
Module Layer  (controller → service → repository)
      │
      ▼
Prisma Client
      │
      ▼
MySQL (shared database, shared schema)
```

One Next.js codebase serves both the UI and the API routes. Every business
capability lives in `modules/<name>/` (see `MODULE_GUIDE.md`). There is no
separate backend service today — see "Future Microservice Strategy" below for
how that changes without a rewrite.

---

## Multi-Tenant Model

Shared Database, Shared Schema: one MySQL database, one set of tables, every
tenant's rows interleaved and separated only by `tenant_id`. Chosen over
database-per-tenant or schema-per-tenant — see `decisions/0002-shared-database.md`
for the trade-off analysis.

```text
Super Admin
   └── Tenant
         ├── Users (→ Role)
         ├── Warehouses
         ├── Products (→ Category, Brand, Unit)
         ├── Customers / Suppliers
         ├── Purchases / Sales
         └── Inventory (Balance + Transaction ledger)
```

- Super Admin: cross-tenant access, manages Plans/Features/system tables.
- Tenant Admin: full access within their own `tenant_id`.
- Employee: scoped further by RBAC (see below).

**Every repository query must filter by `tenant_id`** unless the caller is
Super Admin. There is no row-level security enforced by the database itself —
tenant isolation is an application-layer guarantee, enforced in the repository
layer. This is a deliberate simplicity/scale trade-off, not an oversight: it
keeps a single connection pool and lets one query span tenants for Super
Admin/reporting use cases, at the cost of requiring discipline in every
repository method. Missing a `tenant_id` filter is a data leak, not just a bug
— treat it with that severity in code review.

---

## Authentication Flow

```text
Client submits credentials
      │
      ▼
auth module validates credentials, issues JWT
      │  (payload: userId, tenantId, roleId)
      ▼
Client sends JWT on every subsequent request (Authorization header)
      │
      ▼
Middleware verifies JWT signature + expiry
      │
      ▼
tenantId / userId attached to request context
```

JWT is stateless: no server-side session table. Token expiry + refresh
strategy is an implementation decision for the `auth` module; whichever is
chosen, the refresh path must go through the same Feature/RBAC pipeline as
every other request once it resolves a user.

---

## Authorization: Two Independent Layers

Authorization is **not** a single permission check. It is two checks that
must both pass, in this order:

1. **Feature Access** — does this tenant's subscribed plan even include this
   module? (`tenant_features` / `plan_features`). If not, the request fails
   *before* touching business logic or RBAC — a tenant without the Purchase
   feature should get a 403 that never reaches `PurchaseService`.
2. **RBAC** — given the module is enabled, can *this user's role* perform
   *this specific action*? (`role_permissions` → `permissions`, e.g.
   `PRODUCT.CREATE`).

Feature access answers "is this available to the tenant at all." RBAC answers
"is this available to this user." Conflating them (e.g. checking permissions
without first checking the feature flag) would let a downgraded tenant keep
using a module they no longer pay for, as long as an employee's role still
has the permission bit set.

---

## Request Pipeline

Every API request follows this exact order. No step may be skipped or
reordered.

```text
1. Authentication        — verify JWT, resolve userId
2. Resolve Tenant         — attach tenantId to request context
3. Subscription Validation — tenant's plan is active, not expired/suspended
4. Feature Validation      — tenant's plan includes this module
5. Permission Validation   — user's role includes this action
6. Controller → Service → Repository → Database
```

Implemented as Next.js middleware/route wrappers shared via
`shared/middleware/`, not re-implemented per module.

---

## Module Communication

Modules call each other only through public **services**, never through
another module's repository. See `MODULE_GUIDE.md` for the full rule and
worked example.

```text
Sale creation:
  SalesService.create()
      → InventoryService.reserveStock()   (cross-module, via service)
      → SalesRepository.save()            (own repository)
```

This is what keeps a module extractable into its own microservice later
without rewriting its callers — callers only ever depended on a service
interface, never on how that service stored its data.

---

## Event / Data Flow: Inventory

Inventory is **event-sourced**, not just a mutable counter:

```text
Purchase confirmed
      │
      ▼
InventoryTransaction row (type=PURCHASE_IN, append-only)
      │
      ▼
InventoryBalance row updated (derived, mutable, current snapshot)
```

The transaction ledger (`inventory_transactions`) is never edited or deleted
— corrections are new transactions (e.g. a `StockAdjustment`), never an
UPDATE to history. `InventoryBalance` can always be rebuilt by replaying the
ledger; it exists purely as a read-optimization so "current stock" doesn't
require summing potentially millions of ledger rows on every read.

Both writes must happen inside a single database transaction (see
`DATABASE.md` → Transaction Rules) — a ledger entry with no matching balance
update (or vice versa) is a data integrity bug.

---

## Scalability

Designed to support thousands of tenants, millions of products, and multiple
warehouses per tenant without an architecture change:

- **Composite indexes on `tenant_id` + hot lookup columns** (`sku`, `barcode`,
  `warehouse_id`, `status`) — see `DATABASE.md` for the full index list.
- **Append-only ledgers** (`inventory_transactions`, `audit_logs`) are
  designed to be partitionable by `created_at` once row counts justify it.
- **Stateless JWT auth** — any app instance can serve any request, so the
  Next.js layer scales horizontally behind a load balancer with no sticky
  sessions.
- **Module boundaries enforced through services, not shared repositories** —
  a module with different scaling needs (e.g. Inventory under heavy write
  load) can be split out without its callers changing.

## Future Microservice Strategy

Because modules only ever call each other through service interfaces, a
module can be extracted into its own deployable service by:

1. Wrapping its existing `Service` class behind an internal HTTP/RPC
   endpoint.
2. Replacing the in-process `import` in calling modules with an HTTP client
   that implements the same method signatures.
3. Giving the extracted module its own database (or its own tables within the
   shared database, as a first step) once it needs independent scaling.

No calling module's business logic changes — only the transport between
"caller" and "service" changes. This is the entire reason repositories are
private to their module and cross-module calls are banned: it is what makes
step 2 possible without a rewrite.

---

## Sales Channels: POS, Online, Marketplace

`Sale.channel` (`POS` / `ONLINE` / `MARKETPLACE` / `PHONE`) is the single
discriminator for every way a sale can originate. There is deliberately no
separate `Order` table for online sales — same entity, same inventory-ledger
trigger, just a different client driving it and a different subset of
`SaleStatus`:

```text
POS:      DRAFT → CONFIRMED → COMPLETED
ONLINE:   PENDING_PAYMENT → CONFIRMED → PROCESSING → PACKED → SHIPPED → DELIVERED
```

Both still go through the same `Route → Controller → Service → Repository`
pipeline in the `sales` module — the channel only changes which client called
in and which status transitions are valid, never which layer handles the
write.

### Android POS as an API client

The POS app is not a separate backend — it authenticates as a staff user
through the same JWT/tenant/feature/RBAC pipeline as any other client, and
calls the same `/api/v1/sales` endpoint with `channel: "POS"`. Two POS-specific
concerns layer on top of the existing pipeline rather than replacing it:

- **Offline-first sync**: the device queues sales locally when offline and
  syncs on reconnect. Every sale it submits carries a client-generated
  `Idempotency-Key` header; `shared/middleware/` checks it against
  `IdempotencyKey` (see `DATABASE.md`) before it reaches the controller, so a
  retried sync after a dropped connection replays the stored response instead
  of creating a duplicate sale and double-decrementing stock.
- **Terminal + cash session attribution**: a POS sale carries `terminalId`
  (which registered device) and `cashSessionId` (which cashier shift), used
  for end-of-shift cash reconciliation — see `Terminal`/`CashSession` in
  `DATABASE.md`. Neither applies to `ONLINE`/`MARKETPLACE` sales, hence both
  are nullable on `Sale`.

### Two auth chains, one API

Staff-facing clients (POS, admin UI) and a future customer-facing storefront
share the same route handlers but sit behind different auth middleware:

```text
Staff/internal:  JWT (user + tenant + role) → Feature Validation → RBAC
Public/customer: customer session or guest checkout → Feature Validation only
                 (no RBAC — a customer isn't a tenant employee with a role)
```

A public storefront module is not yet built; when it is, keep its
customer-facing endpoints (`/api/v1/storefront/...`) separate from the
staff-facing ones (`/api/v1/sales`, `/api/v1/products`) rather than
overloading one endpoint with two auth strategies.

---

## Delivery / Fulfillment Integration

Delivery partners (Shiprocket, Delhivery, Dunzo, Porter, or a tenant's own
in-house riders) are integrated through a pluggable adapter pattern owned by
a `modules/delivery/` module — the same "swap the implementation, not the
caller" principle as the Future Microservice Strategy above:

```text
SalesService (or an order-fulfillment workflow)
      │
      ▼
DeliveryService.createShipment(saleId)
      │
      ▼
DeliveryProviderAdapter   (one implementation per provider)
      │           interface: createShipment() / getTrackingStatus() / cancelShipment()
      ▼
ShiprocketAdapter | DelhiveryAdapter | DunzoAdapter | ManualAdapter
```

`DeliveryService` picks which adapter to invoke by looking up the tenant's
enabled provider(s) in `TenantDeliveryConfig` (see `DATABASE.md`) — the
calling `SalesService` never knows or cares which courier is behind the
call. Adding a new courier later means writing one new adapter class; it
never touches `SalesService` or any other caller.

Inbound tracking updates arrive via a signed webhook per provider
(`/api/v1/webhooks/delivery/{provider}`), verified against
`TenantDeliveryConfig.webhookSecret`, which updates `Shipment.status` and, on
terminal states (`DELIVERED`, `FAILED`, `RETURNED`), cascades to
`Sale.status`. Webhook delivery is retried by definition (couriers redeliver
on timeout), so webhook handlers must also honor `Idempotency-Key` /
event-id deduplication — the same mechanism the POS sync path uses, not a
second one.

Courier API credentials are tenant-owned secrets and are stored encrypted
(`TenantDeliveryConfig.credentialsEncrypted`), never in plaintext — see
`DATABASE.md`.
