# Webhooks & Website Integration — Design Plan

> Status: **planned, not implemented.** This document is the design for a
> feature that does not exist in the codebase yet — no `modules/webhook/`,
> no `Webhook*` Prisma models. It follows the same shape every other
> feature in this repo was built in: schema → backend module → frontend →
> tests, gated by the existing Feature/Plan system. Nothing here should be
> built without a plan-mode pass to confirm scope first, same as every
> other feature this session.

## 1. What this is for

A tenant wants their own e-commerce website and this platform to act as
one system:

1. **Orders placed on their website should land here as real Sales** —
   inventory decrements, tax is computed, the sale shows up in Sales/
   Reports exactly like a POS or admin-dashboard sale.
2. **Their website should stay in sync with what's sold here** — product
   catalog, resolved pricing, and active discounts/coupons, so a customer
   browsing their site sees current stock/price/promotions without the
   tenant manually re-entering anything in two places.

Both directions are gated behind one feature, but they are architecturally
different, and this doc keeps them distinct throughout:

| | Direction | What it actually is |
|---|---|---|
| **Outbound webhooks** | Platform → tenant's website | The platform POSTs an event payload to a URL the tenant registered, whenever their catalog/pricing/discounts change. This is a "webhook" in the strict sense. |
| **Inbound order ingestion** | Tenant's website → platform | The tenant's website calls a platform API, authenticated with a per-tenant credential, to create a Sale. Not a webhook by the strict definition (nothing is being "hooked" — it's a normal authenticated API call) — grouped here because it's the other half of the same "connect my website" story, shares the same credential, and is gated by the same feature flag.

## 2. Feature flag & plan limit

Follows the exact pattern already used for `EXTRA_CHARGE`/`GST_REPORT`
(`prisma/seed.ts`'s `FEATURE_CODES`/`FEATURE_LABELS`, enforced via
`withApiAuth({ feature: "...", permission: "..." })`) and for
`maxWarehouses`/`maxUsers`/`maxRoles` (`Plan.maxWebhooks`, see below,
`shared/utils/plan-limits.ts`):

- New feature code **`WEBHOOK`** — gates every route in this doc (both
  directions). A tenant whose plan doesn't include it gets
  `FEATURE_NOT_ENABLED` on registration endpoints, and inbound order
  ingestion must re-check it per-request too (see §7 — a downgraded plan
  has to stop working immediately, not just block new registrations).
- New permission codes: `WEBHOOK.VIEW`, `WEBHOOK.CREATE`, `WEBHOOK.UPDATE`,
  `WEBHOOK.DELETE`.
- New `Plan.maxWebhooks Int?` (nullable = unlimited, same convention as
  the three existing limits) — caps how many `WebhookEndpoint` rows
  (outbound registrations) a tenant may create. **Does not cap inbound
  order volume** — that's a usage metric, not a registration count, and
  capping it belongs in a future rate-limiting discussion (§7), not this
  quota.
  - `shared/utils/plan-limits.ts`'s `getActivePlanLimits()` gets a fourth
    field; the Super Admin Plan form (`app/super-admin/(dashboard)/plans/
    page.tsx`) gets a fourth limit input, mirroring `maxRoles`'s addition
    exactly.
  - Enforced in `webhookService.create()` the same way
    `roleService.create()` enforces `maxRoles`: count existing
    `WebhookEndpoint` rows for the tenant, `PLAN_LIMIT_REACHED` (409,
    already an existing `AppError` code) once at the cap.

**Suggested tiering** (a business decision, not this doc's to make —
flagging for when `FEATURES_AND_PRICING.md` gets updated): this is an
advanced integration capability, so it likely belongs alongside the other
Growth+/Enterprise-only features rather than Starter. A reasonable
starting point: not in Starter; Growth gets a small cap (e.g. 2); Enterprise
unlimited — same shape as the Roles/Warehouses/Users limits already
tiered that way.

## 3. Data model

New models, added to `prisma/schema.prisma`. Follows the
`DeliveryProvider`/`TenantDeliveryConfig`/`Shipment` section immediately
above it in the schema as the closest existing precedent — that section
already anticipates exactly this shape (`credentialsEncrypted`,
`webhookSecret` on `TenantDeliveryConfig`) for a different integration,
just never built out into a real module (`modules/delivery/` does not
exist yet either — see §9).

```prisma
enum WebhookEventType {
  PRODUCT_CREATED
  PRODUCT_UPDATED
  PRODUCT_DELETED
  PRICE_LIST_UPDATED
  DISCOUNT_CREATED
  DISCOUNT_UPDATED
  DISCOUNT_DELETED
  COUPON_CREATED
  COUPON_UPDATED
  COUPON_DELETED
  INVENTORY_UPDATED
}

enum WebhookDeliveryStatus {
  PENDING
  SUCCESS
  FAILED
}

// One per tenant — the root of a tenant's "website integration." Holds the
// credential used for INBOUND order ingestion (apiKey/apiSecret), separate
// from the per-endpoint signing secrets used for OUTBOUND payloads below.
// apiSecret is stored encrypted (reversible), not hashed — it has to be
// read back to verify an inbound HMAC signature, unlike a login password.
// See §7 on the encryption utility this needs, which doesn't exist yet.
model TenantWebhookIntegration {
  id                BigInt   @id @default(autoincrement())
  tenantId          BigInt   @unique
  apiKey            String   @unique @db.VarChar(64)
  apiSecretEncrypted String  @db.Text
  isEnabled         Boolean  @default(true)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  tenant   Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  webhooks WebhookEndpoint[]

  @@map("tenant_webhook_integrations")
}

// One row per registered outbound URL. signingSecret is per-endpoint (not
// shared with the integration's apiSecret) so a tenant with two receiving
// systems can rotate one without affecting the other.
model WebhookEndpoint {
  id            BigInt   @id @default(autoincrement())
  tenantId      BigInt
  integrationId BigInt
  url           String   @db.VarChar(500)
  signingSecret String   @db.Text
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  tenant      Tenant                    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  integration TenantWebhookIntegration  @relation(fields: [integrationId], references: [id], onDelete: Cascade)
  eventTypes  WebhookEndpointEventType[]
  deliveries  WebhookDelivery[]

  @@index([tenantId])
  @@map("webhook_endpoints")
}

// Many-to-many (an endpoint subscribes to several event types) — a real
// join table, not a comma-separated column, matching the PlanFeature/
// TenantFeature/RolePermission precedent rather than ExtraCharge's
// one-off applicableChannels string (this is a genuine set relationship,
// not an optional restriction list).
model WebhookEndpointEventType {
  webhookEndpointId BigInt
  eventType         WebhookEventType

  webhookEndpoint WebhookEndpoint @relation(fields: [webhookEndpointId], references: [id], onDelete: Cascade)

  @@id([webhookEndpointId, eventType])
  @@map("webhook_endpoint_event_types")
}

// Delivery log + retry state. One row per attempted delivery (not per
// event — a retried delivery updates the same row, see §5's retry policy).
model WebhookDelivery {
  id                BigInt                @id @default(autoincrement())
  webhookEndpointId BigInt
  eventType         WebhookEventType
  payload           Json
  status            WebhookDeliveryStatus @default(PENDING)
  httpStatusCode    Int?
  attemptCount      Int                   @default(0)
  lastAttemptedAt   DateTime?
  nextRetryAt       DateTime?
  createdAt         DateTime              @default(now())

  webhookEndpoint WebhookEndpoint @relation(fields: [webhookEndpointId], references: [id], onDelete: Cascade)

  @@index([webhookEndpointId, status])
  @@index([nextRetryAt])
  @@map("webhook_deliveries")
}
```

Plus the one-line addition to the existing `Plan` model:
```prisma
maxWebhooks Int?
```

And two nullable fields on the existing `Sale` model — see §4.1 for why
`channel: "ONLINE"` alone isn't enough:
```prisma
webhookIntegrationId    BigInt?  // FK -> TenantWebhookIntegration.id
externalOrderReference  String?  @db.VarChar(150)
```

## 4. Inbound order ingestion

**`POST /api/v1/integrations/orders`** — deliberately *not* under
`withApiAuth` (there's no browser session; the caller is the tenant's own
server), and not under the Super Admin pipeline either. A third, new auth
wrapper is needed:

- Headers: `X-Api-Key: <TenantWebhookIntegration.apiKey>`,
  `X-Signature: sha256=<hex hmac>` (HMAC-SHA256 of the raw request body
  using the decrypted `apiSecretEncrypted`), and (recommended)
  `Idempotency-Key: <caller-chosen-key>`.
- New `shared/middleware/with-webhook-auth.ts` (name TBD), mirroring the
  shape of `shared/middleware/with-api-auth.ts`'s pipeline but shorter:
  look up the integration by `apiKey` → verify signature → verify
  `isEnabled` → verify the tenant's `WEBHOOK` feature is enabled *and*
  the tenant has an active, unexpired subscription (reuse
  `getActiveSubscription`/`isSubscriptionExpired` from
  `shared/utils/subscription.ts` — same rule that already blocks login
  for an expired contract should block this too, not just the browser
  session).
- **Idempotency**: reuse the existing, currently-unused `IdempotencyKey`
  model (`prisma/schema.prisma` — already has `tenantId`, `key`,
  `requestHash`, `statusCode`, `responseBody`, `expiresAt`, but nothing in
  the codebase writes to it yet). If `Idempotency-Key` is present and
  already recorded for this tenant with a matching `requestHash`, return
  the stored response instead of re-creating the sale — external
  callers retry on timeout, and creating two Sales for one real order is
  the worst failure mode here.
- Payload maps to the same `CreateSaleDto` that `POST /sales` already
  uses (`modules/sales/service/sale.service.ts`), with `channel` forced
  to `"ONLINE"` regardless of what the caller sends, and line items
  resolved by SKU or barcode (the external site's product ids won't match
  internal ones) rather than internal `productId`. **No price field is
  ever accepted from the payload** — same rule `POST /sales` already
  enforces for every other channel: the server resolves price via the
  existing price-list/`pricing/resolve` logic, and the whole request
  fails with `VALIDATION_ERROR` if nothing configures a price for a given
  product at the tenant's default "online" warehouse — the tenant
  configures a single default warehouse for inbound online orders to
  resolve against, similar to how the Android app's `/auth/me` supplies a
  scoped `warehouseId` (see §11, this needs confirming before build).
- Response: order id + computed totals, same shape `POST /sales` already
  returns — this is a thin adapter on top of the existing sale-creation
  path, not a parallel implementation of pricing/tax/stock logic.

### 4.1 Traceability — linking a Sale back to its source

`channel: "ONLINE"` alone isn't enough to answer "did this specific sale
come through the webhook integration, and which of the tenant's own order
numbers does it correspond to?" — `ONLINE` is a general channel, not
proof of origin, and a tenant's own support team will need to reconcile
"customer says their website order #1234 never showed up" against this
platform's Sale records.

Two nullable fields on `Sale` (added in §3), populated only for
webhook-originated sales, `null` for every other channel:
- **`webhookIntegrationId`** — FK to `TenantWebhookIntegration`. Proves
  *how* the sale was created, independent of `channel` (which stays a
  business concept — POS/online/marketplace/phone — not an integration
  audit trail).
- **`externalOrderReference`** — the order id/number from the payload,
  exactly as the tenant's website sent it (Shopify/WooCommerce-style
  integrations always carry one). Shown on the Sale detail page
  (`app/(dashboard)/sales/[id]/page.tsx`) whenever present, and made
  searchable in the Sales list filter, so "find the sale matching their
  order #1234" is a direct lookup, not a support escalation.

**Second layer of duplicate protection**: `Idempotency-Key` (§4) is the
primary defense against a retried request creating two Sales, but not
every caller reliably sends one. Before creating a sale, also check for an
existing `Sale` with the same `tenantId` + `webhookIntegrationId` +
`externalOrderReference`; if one exists, return it instead of creating a
duplicate (same "return the existing result, don't error and don't
duplicate" behavior as the idempotency-key path) rather than relying on a
hard unique constraint, which would incorrectly reject a legitimate
re-send after a genuine correction upstream.

## 5. Outbound webhook delivery

**Trigger points** — the existing mutation services fire an event after
their own write succeeds (never before — a webhook must never announce a
change that didn't actually commit):
- `modules/product/service/product.service.ts` — create/update/delete
- `modules/pricing/service/*` (`price-list`, `discount`, `coupon`
  services) — create/update/delete
- `modules/inventory/service/inventory.service.ts` — balance changes
  (optional for v1 — likely the highest-volume event type; consider
  deferring to a later iteration rather than shipping on day one)

Each call site does one thing: `webhookService.enqueue(tenantId, eventType, payload)` —
finds every `WebhookEndpoint` for that tenant subscribed to that
`eventType` (via `WebhookEndpointEventType`), writes one `WebhookDelivery`
row per matching endpoint (`status: PENDING`), and attempts an immediate
best-effort delivery (fire-and-forget — never blocks or fails the caller's
own request; a slow/down receiving endpoint must not slow down the
tenant's own product/discount edit).

**No cron/queue infrastructure exists in this codebase today** (already a
known, deliberate gap — see the subscription-renewal work, which chose a
live-computed banner over a background job for the same reason). Retries
for a *failed* delivery therefore need the same pragmatic answer already
used elsewhere: a protected endpoint
(`POST /api/v1/super-admin/webhooks/process-pending`, `withSuperAdminAuth`,
or a shared-secret-protected route if it needs to run outside a logged-in
session) that drains `WebhookDelivery` rows where
`status = PENDING/FAILED AND nextRetryAt <= now()`, meant to be invoked by
an external scheduler (Windows Task Scheduler in dev, a cloud cron in
production) — not built as an in-process timer, consistent with this
codebase's existing "no assumed background process" stance.

- **Retry policy**: exponential backoff — attempt immediately, then retry
  at +1m, +5m, +30m, +2h (`nextRetryAt` set after each failure), capped at
  5 attempts, then `status = FAILED` permanently (visible in the tenant's
  UI, not silently dropped).
- **Signing**: `X-Webhook-Signature: sha256=<hmac>` header, HMAC-SHA256 of
  the raw JSON body using that `WebhookEndpoint.signingSecret` — lets the
  tenant's website verify a payload actually came from this platform
  before trusting it.
- **What "success" means**: any `2xx` response from the receiving URL
  within a short timeout (e.g. 10s). Anything else (non-2xx, timeout,
  connection error) is a failure and enters the retry cycle.

## 6. Payload contracts — and what they're for

Every payload's job is to say "something changed, here's a hint of what" —
**never to be the authoritative source for a real transaction**. This
matches the "never trust client-cached money" principle already
enforced everywhere in this app (`INVOICE_CALCULATION_LOGIC.md`, the
`pricing/quote`/`pricing/resolve` endpoints):

Field lists below are exactly the existing `*View` shapes each module
already returns from its own API (`modules/product/types/product.types.ts`,
`modules/pricing/types/{price-list,discount,coupon}.types.ts`) — a webhook
payload is never a bigger/different shape than what an authenticated
dashboard call to that resource already exposes.

- **`PRODUCT_CREATED`/`PRODUCT_UPDATED`/`PRODUCT_DELETED`** —
  `id, sku, barcode, name, status, categoryId, brandId, unitId, taxRateId,
  images[]`. **No price, no cost, no supplier** — price is warehouse/
  customer-group scoped, not a single number on a product, and cost/
  supplier data is never tenant-external-facing at all.
- **`PRICE_LIST_UPDATED`** — the price list's `id, name, warehouseId,
  customerGroupId, customerId, isDefault` plus its `items[]`
  (`productId, price, minQuantity`). Only the *selling* price. A
  convenience/display hint for the tenant's website to update its shown
  prices — at actual checkout time (via the inbound order endpoint),
  price is still resolved server-side from scratch, exactly like every
  other channel. The payload is not itself an authorization to charge
  that price.
- **`DISCOUNT_CREATED`/`UPDATED`/`DELETED`** — `name, type, value, scope,
  productIds[], categoryIds[], minPurchaseAmount, maxDiscountAmount,
  startDate, endDate, isActive, stackable, priority`.
- **`COUPON_CREATED`/`UPDATED`/`DELETED`** — same shape as Discount plus
  `code` (instead of a display name) and `usageLimitTotal`/
  `usageLimitPerCustomer` instead of `priority`.
  Both are enough for the website to *display* "10% off Category X" or
  "code SAVE10 available" — never enough to apply a discount. Actual
  validation/application only happens through this platform's own
  `pricing/quote`/`sales` endpoints when the order comes back in.
- **`INVENTORY_UPDATED`** (if built) — `productId, warehouseId, quantity`
  only — lets a website hide an out-of-stock item without polling.

**Never included, in any event**: cost price, supplier/purchase data,
customer PII, or any other tenant's data — and nothing beyond what that
resource's own existing `*View` type already exposes through the regular
authenticated API.

## 7. Security

- **SSRF**: a tenant-supplied webhook URL is attacker-reachable input.
  Validate at registration *and* re-validate at delivery time (DNS
  rebinding — a hostname can resolve differently between the two): reject
  non-`https://` schemes (or `http://` only in local dev), resolve the
  hostname and reject private/loopback/link-local/cloud-metadata IP
  ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`,
  `169.254.0.0/16`), and reject the platform's own origin.
- **Encryption at rest**: `apiSecretEncrypted` and `signingSecret` need a
  real reversible-encryption utility — `TenantDeliveryConfig`'s schema
  comment already names the intended location
  (`shared/security/`), but that directory doesn't exist yet either. This
  feature and the (also still unbuilt) Delivery integration would share
  it — worth building once, not duplicating.
- **Re-check the feature flag on every use, not just at registration**: a
  tenant downgraded off a plan with `WEBHOOK` must stop being able to
  receive inbound orders and stop having outbound deliveries attempted
  immediately — same principle `withApiAuth` already enforces for every
  other feature-gated route.
- **Rate limiting** the inbound endpoint per `apiKey` is out of scope for
  a first version but should be called out as a follow-up before this
  goes to real production traffic — nothing in this codebase currently
  rate-limits anything.
- **Secret display**: `apiSecretEncrypted`/a freshly-generated
  `signingSecret` is shown **once**, at creation/rotation time, in the
  response body only — never returned again on a later `GET`. "Regenerate"
  invalidates the old value immediately (a stale copy stops working, no
  grace period, matching how a leaked secret should be treated).

## 8. Tenant-facing UI

New page, `app/(dashboard)/settings/webhooks/page.tsx` (or a new
`/webhooks` nav item under the existing "Settings" section in
`lib/nav/sections.ts` — matches the pattern already used for the
Subscription card's placement decision), gated by
`{ feature: "WEBHOOK", permission: "WEBHOOK.VIEW" }`:

- **Integration credentials** card: shows the `apiKey` (safe to display
  indefinitely) and a "Generate/Regenerate secret" action that reveals the
  plaintext secret exactly once in a copy-to-clipboard dialog, then never
  again.
- **Webhook endpoints** list (up to `Plan.maxWebhooks`, mirrors the
  `PLAN_LIMIT_REACHED` UX already built for Roles/Users/Warehouses): URL,
  subscribed events (checkboxes from `WebhookEventType`), active/inactive
  toggle, last delivery status + timestamp, a delivery-log drill-down
  (paginated `WebhookDelivery` history for that endpoint).
- **"Send test event"** button per endpoint — fires a synthetic
  `PRODUCT_UPDATED` payload immediately so a tenant can verify their
  receiving code before relying on a real catalog change (same UX Stripe/
  GitHub webhooks already popularized — lets a tenant debug without
  needing to actually edit a product).

## 9. Module layout

Follows `MODULES.md`'s per-module structure exactly, one new module:

```
modules/webhook/
  dto/webhook.dto.ts
  schema/webhook.schema.ts
  repository/webhook.repository.ts        # TenantWebhookIntegration + WebhookEndpoint + WebhookDelivery queries
  service/webhook.service.ts              # create/list/rotate/enqueue/deliver/retry
  controller/webhook.controller.ts
  types/webhook.types.ts
  tests/webhook.service.test.ts

app/api/v1/integrations/orders/route.ts           # inbound, new auth wrapper (§4)
app/api/v1/webhooks/route.ts                      # GET list / POST create endpoint
app/api/v1/webhooks/[id]/route.ts                 # PUT / DELETE
app/api/v1/webhooks/[id]/test/route.ts             # POST — send test event
app/api/v1/webhooks/integration/route.ts          # GET/POST — view apiKey / regenerate secret
app/api/v1/super-admin/webhooks/process-pending/route.ts  # retry-drain, external-cron-triggered (§5)

shared/security/encryption.ts             # new — reversible encrypt/decrypt, shared with Delivery integration
shared/middleware/with-webhook-auth.ts    # new — inbound-order auth pipeline (§4)
```

## 10. Rollout, mirroring how every other feature shipped this session

1. **Schema + migration**: the five new models/enum + `Plan.maxWebhooks`,
   hand-written migration SQL + `prisma migrate deploy` (this UAT DB has
   no shadow-DB permission, so `migrate dev` won't work — same workaround
   already used for every migration this session).
2. **`shared/security/encryption.ts`**: the encryption utility both this
   feature and the dormant Delivery integration need — build once.
3. **Backend module** (`modules/webhook/**` + the new routes) + the new
   `with-webhook-auth.ts` pipeline, wired into `POST /sales`'s existing
   creation path rather than reimplementing it.
4. **Outbound delivery wiring**: the `webhookService.enqueue()` calls
   added to Product/PriceList/Discount/Coupon services, plus the
   super-admin retry-drain endpoint.
5. **Frontend**: the tenant Webhooks settings page, and the `WEBHOOK`
   feature/`maxWebhooks` additions to the Super Admin Plan form.
6. **Tests**: service-level tests for limit enforcement (mirrors
   `role.service.test.ts`'s `maxRoles` cases exactly), signature
   verification, SSRF URL validation, and idempotency-key replay.

## 11. Open questions (need a decision before implementation starts)

- Which warehouse does an inbound online order draw stock from — a new
  per-tenant "default online warehouse" setting, or does the payload
  specify one? (§4 assumes a tenant-level default; needs confirming.)
- Is `INVENTORY_UPDATED` in scope for v1, given it's likely the
  highest-frequency event and the first real test of the retry/backoff
  path at volume?
- Where does `/webhooks` live in the tenant nav — its own item, or folded
  into the Settings page like the Subscription card was?
- Confirm the suggested plan tiering (§2) against `FEATURES_AND_PRICING.md`
  before it's built, same as every other feature-flag decision this
  session went through `AskUserQuestion` for.
