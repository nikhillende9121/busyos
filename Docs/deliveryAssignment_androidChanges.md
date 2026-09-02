# Delivery Assignment — Android App Changes

A sale is now assigned to a specific delivery person when it ships, and
only that person (or a manager) can confirm it delivered. Three API
changes, one new endpoint.

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
