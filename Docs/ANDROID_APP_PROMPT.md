# ANDROID_APP_PROMPT.md

A ready-to-use prompt for building the Store Manager Android app's UI in a
separate Android project/session. Based on `Docs/MOBILE_API_GUIDE.md`,
corrected for two things that changed since that doc was written —
`GET /auth/me` now returns `warehouseId`/`warehouseName`/`enabledFeatures`,
and Sale Exchange (`/api/v1/sale-exchanges`) is a newer endpoint that guide
predates. Paste everything below the line into a fresh session pointed at
the Android project.

---

Build the UI for a native Android app — a "Store Manager" companion app for an existing multi-tenant inventory/POS platform. The backend REST API already exists and is complete; you are only building the Android client (Kotlin + Jetpack Compose, Material 3). Do not build or modify any backend — every screen below is a thin UI over an endpoint that already works.

## What this app is for
A single store's staff (cashier / store manager) logging in on their phone/tablet to run day-to-day operations for exactly one warehouse: ring up sales, process returns and exchanges, receive purchases, check stock, and move stock between stores. It is the mobile counterpart to a web "Store" view that already exists — same API, same permissions, simplified for a phone.

## Tech expectations
- Kotlin, Jetpack Compose, Material 3, single-activity/Compose Navigation.
- Retrofit + OkHttp (or Ktor client) for networking; store tokens in EncryptedSharedPreferences / Android Keystore — never plain SharedPreferences.
- MVVM with a ViewModel per screen; Compose state hoisting, no business logic in Composables.
- Offline is out of scope for v1 — assume connectivity, but handle errors gracefully (see error table below).

## Auth
Two-token JWT flow, no cookies (that's the browser's problem, not yours):

```
POST /api/v1/auth/login
Body: { "tenantCode": "acme", "email": "manager@store.test", "password": "..." }
-> { accessToken, refreshToken }
```
- Access token TTL 15 min, refresh token TTL 7 days.
- Every other call: `Authorization: Bearer <accessToken>`.
- On any `401 UNAUTHENTICATED`: call `POST /api/v1/auth/refresh` with `{ refreshToken }` once, retry the original request; if refresh also fails, force full re-login.
- There is no logout endpoint — "logging out" just means deleting the stored tokens locally.
- Login screen needs three fields: tenant code, email, password. Tenant code is required (email is only unique within a tenant, not globally).

Right after login, call `GET /api/v1/auth/me`:
```json
{
  "id": "4", "name": "...", "email": "...", "tenantId": "2",
  "warehouseId": "5", "warehouseName": "Downtown Store",
  "role": { "id": "3", "name": "Store Manager" },
  "permissions": ["SALE.VIEW", "SALE.CREATE", "..."],
  "enabledFeatures": ["SALES", "SALE_RETURN", "SALE_EXCHANGE", "PURCHASE", "..."]
}
```
Use `permissions` to decide which buttons/nav items to show (not the authority — server re-checks everything — just avoids showing an action that will 403). Use `enabledFeatures` the same way: if a feature code isn't in this list, hide that whole section of the app rather than showing it and letting it 403 with `FEATURE_NOT_ENABLED`. `warehouseId`/`warehouseName` tells you which single store this login is scoped to — show it persistently in the app's top bar so the user always knows which store they're operating on.

## Navigation
Bottom navigation bar (Material 3), one tab per area the user's `permissions` + `enabledFeatures` allow:
- **Sales** (feature `SALES`, permission `SALE.VIEW`)
- **Sale Returns** (feature `SALE_RETURN`, permission `SALE_RETURN.VIEW`)
- **Sale Exchanges** (feature `SALE_EXCHANGE`, permission `SALE.EXCHANGE`)
- **Purchases** (feature `PURCHASE`, permission `PURCHASE.VIEW`)
- **Purchase Returns** (feature `PURCHASE_RETURN`, permission `PURCHASE_RETURN.VIEW`)
- **Inventory** (feature `INVENTORY`, permission `INVENTORY.VIEW`)
- **Stock Transfers** (feature `STOCK_TRANSFER`, permission `STOCK_TRANSFER.VIEW`)

Every list/detail endpoint is already filtered/scoped server-side to this user's one warehouse — never show a warehouse picker anywhere in this app, there's nothing to pick.

## Sales — the core screen, build this like a real checkout
Not a form. A tap-first flow:
1. **Product grid**: searchable (by name/SKU/barcode), tap a tile to add to a running cart.
2. **Cart panel**: quantity steppers per line, a price field per line (there's no product price column server-side — price list resolution isn't exposed to this endpoint, so price is entered per line same as the web version), a running subtotal.
3. One **Charge** button at the bottom that does `POST /api/v1/sales`:
```json
{ "customerId": "..", "warehouseId": "<own, from /auth/me>", "channel": "POS", "saleDate": "2026-08-06", "items": [{ "productId": "..", "quantity": "2", "price": "499.00" }], "couponCode": "optional" }
```
Then immediately `POST /sales/{id}/confirm` (or leave as draft if you want a separate confirm step — your call, but POS channel skips straight to DRAFT then confirm decrements stock).
- Sale list/detail screens need lifecycle action buttons that appear only when valid for the current status: Confirm, Process, Pack, Ship, Deliver, Complete, Cancel (`POST /sales/{id}/{action}`) — each is a distinct endpoint, not a generic "advance" call.

## Sale Returns
Pick a CONFIRMED/COMPLETED sale, pick line(s) to return with quantities, a reason string, submit:
```
POST /api/v1/sale-returns
Body: { "saleId": "..", "reason": "...", "items": [{ "saleItemId": "..", "quantity": "1" }] }
```
Response includes a discount-aware `refundAmount` per line and `totalRefundAmount` — display it, don't recompute it client-side.

## Sale Exchanges (newer endpoint, not in your old docs)
Same idea as a return, but the customer also walks out with different product(s) and the difference is settled on the spot:
```
POST /api/v1/sale-exchanges
Body: {
  "saleId": "..", "reason": "...",
  "returnItems": [{ "saleItemId": "..", "quantity": "1" }],
  "newItems": [{ "productId": "..", "quantity": "1", "price": "599.00" }],
  "paymentMethod": "CASH"
}
```
Response has `differenceAmount` + `differenceDirection` (`CUSTOMER_OWES` / `REFUND_DUE` / `EVEN`) — show this prominently after submit ("Customer owes ₹100" / "Refund ₹40"). UI: return-item picker (like Sale Returns) + a mini version of the Sales product-grid-and-cart for the replacement items, one screen.

## Purchases / Purchase Returns / Stock Transfers
Standard list → detail → lifecycle-action-buttons pattern, same shape as Sales:
- Purchases: create, then `confirm`/`cancel`/`receive`.
- Purchase Returns: create against a received purchase, list, view.
- Stock Transfers: create (pick source/destination — this account can be on *either* side), then `ship`/`receive`/`cancel`.

## Inventory
`GET /inventory/balance` (omit `warehouseId` — it's forced to the caller's own store automatically) — a simple searchable list of product/quantity. `POST /stock-adjustments` for manual corrections (no list endpoint exists for past adjustments, don't try to build one).

## Error handling — map these consistently across every screen
| Code | HTTP | UI treatment |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Inline field errors from `error.details` |
| `UNAUTHENTICATED` | 401 | Silent refresh + retry once; else force re-login |
| `INVALID_CREDENTIALS` | 401 | Login screen error, no retry |
| `FEATURE_NOT_ENABLED` | 403 | Shouldn't be reachable if nav is filtered correctly — if seen, generic "not available on your plan" |
| `PERMISSION_DENIED` | 403 | Includes warehouse-scope mismatches — generic "not allowed" toast |
| `RESOURCE_NOT_FOUND` | 404 | Also returned for other tenants'/stores' data on purpose — treat as plain "not found" |
| `INSUFFICIENT_STOCK` | 422 | Specific toast — this one's actionable ("not enough stock") |

Every response (success or failure) is wrapped: `{ success: true, data, message }` or `{ success: false, error: { code, message, details } }`. Lists are further wrapped: `{ items: [...], pagination: { page, pageSize, total, totalPages } }`.

## Design language
Material 3, light + dark theme. Keep it fast for a cashier: big tap targets, minimal required fields, sensible defaults (today's date, own warehouse always implied). No category/brand/tax-rate/role/user management anywhere in this app — that's tenant-admin territory and stays on the web dashboard.
