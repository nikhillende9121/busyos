# Delivery Assignment — Android App Changes

A sale is now assigned to a specific delivery person when it ships, and
only that person (or a manager) can confirm it delivered. Three API
changes, one new endpoint, and one automatic list-scoping change (no
client change needed for that last one, but worth knowing about).

## 1. Ship Sale now requires an assignee

`POST /api/v1/sales/{id}/ship`

Before: no body. Now:
```json
{ "assignedDeliveryUserId": "24" }
```
Required. Errors (400 `VALIDATION_ERROR`) if the user isn't in this
tenant, or doesn't hold the `SALE.DELIVER` permission.

## 2. New: who can be assigned

`GET /api/v1/sales/delivery-assignees`

Gated by `SALE.SHIP` (same permission as the Ship button itself, not
`USER.VIEW`). Returns only users eligible to be assigned:
```json
{ "success": true, "data": [{ "id": "24", "name": "Courier One" }] }
```
Call this to populate the assignee picker shown right before Ship.

## 3. Deliver Sale can now reject

`POST /api/v1/sales/{id}/deliver` — request unchanged, no body.

New possible response:
```json
{ "success": false, "error": { "code": "PERMISSION_DENIED", "message": "This sale is assigned to a different delivery person" } }
```
Only the assigned delivery person, or a user holding `SALE.UPDATE`
(manager override), can deliver a sale that has an assignee. Show the
Deliver button only when `sale.assignedDeliveryUserId == currentUserId`
or the user holds `SALE.UPDATE`, to avoid a button that always 403s.

## 4. Sale response — two new fields

Present on every sale payload (create, get, list, and every lifecycle
action's response):
```json
"assignedDeliveryUserId": "24",
"assignedDeliveryUserName": "Courier One"
```
Both `null` until the sale ships.

## 5. Sales list is now auto-scoped for delivery-only accounts

`GET /api/v1/sales` and `GET /api/v1/sales/export` (and `GET
/api/v1/sales/{id}`) now automatically narrow to **only the caller's own
assigned deliveries** when the logged-in user's role holds `SALE.DELIVER`
but not the broader `SALE.UPDATE` permission — i.e. a plain "Delivery
Person" role, not a manager. Nothing to send from the app for this — it's
purely server-side — but it means:
- A courier's sales list/count will now differ from an admin's on the
  same tenant, by design.
- Requesting a sale by id that isn't assigned to that courier now returns
  a normal `404 RESOURCE_NOT_FOUND`, not `403` — the app should treat it
  like any other "sale not found."
- A manager/admin role (or anyone without `SALE.DELIVER`) is unaffected
  and keeps seeing the full tenant list.

## 6. Assignment now sends a push notification

The assigned delivery person gets a push the moment ship() succeeds — no
app change needed, it reuses the FCM payload shape already documented in
`notification_androidChanges.md`'s deep-link table:
```
type: "SALE_STATUS", data: { route: "SALE_DETAIL", entityId: "<saleId>" }
```
`onMessageReceived` already routes this to `NavRoute.SaleDetail(id)` per
that table — nothing new to map.

## UI changes needed

- **Ship flow**: before calling ship(), fetch `/sales/delivery-assignees`
  and require the user to pick one — don't let Ship submit without it.
- **Sale detail**: show "Assigned to {assignedDeliveryUserName}" once set.
- **Deliver button**: gate its visibility as described in §3, mirroring
  the server-side check.

## Backward compatibility

Sales shipped before this change (or by an older app build that doesn't
send `assignedDeliveryUserId`) have `assignedDeliveryUserId: null` —
`deliver()` still allows any `SALE.DELIVER` holder on those, so nothing
breaks for in-flight orders.
