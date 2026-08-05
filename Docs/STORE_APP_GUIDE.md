# STORE_APP_GUIDE.md

## What this is

A proposal to build a **web replica of the Android Store Manager app**
inside this same Next.js application — a new, simplified frontend area
for warehouse-scoped users, sitting alongside the existing admin
dashboard rather than inside it. This document is the "what and why";
the "how" (routes, components, exact pages) gets worked out as a
follow-up implementation plan once this is agreed.

## Why

`Docs/MOBILE_API_GUIDE.md` already documents a full REST API surface
built for an Android **Store Manager** app — a login restricted to one
warehouse (`User.warehouseId`) that lists/creates/progresses Sales, Sale
Returns, Purchases, Purchase Returns, Inventory, and Stock Transfers, all
scoped to that one store. That API is live and working today.

There is currently no web equivalent. A warehouse-scoped user *can*
technically log into the existing admin dashboard (`/(dashboard)/**`) —
nav items are filtered by permission, so a narrow Store Manager role
already only sees Sales/Purchases/Inventory/Stock Transfers there — but
that UI is built for tenant admins: dense paginated tables, multi-field
CRUD forms, category/brand/tax-rate pickers, etc. It doesn't feel like
the task-focused, few-taps flow a mobile app gives a cashier or store
lead, and it exposes far more surface area than a store-level user
actually needs.

The goal: give that same warehouse-scoped user a **simpler, purpose-built
web experience** — reusing the exact same login, session, and APIs, just
a different frontend.

## Explicitly out of scope

- **POS Terminal / Cash Session flows** (`Docs/business-rules/pos.md`).
  `Terminal` and `CashSession` exist as Prisma models with zero backing
  service/controller/routes today — building a replica of *that* app
  means building that backend first. Confirmed with the user: not part
  of this effort. This doc is Store Manager only.
- Anything not in the Store Manager's permission set per
  `MOBILE_API_GUIDE.md` §7: no product/category/brand/tax-rate catalog
  management, no pricing/discounts/coupons, no roles/users, no Super
  Admin anything, no warehouse create/update/delete (store setup stays a
  tenant-admin action).
- No new backend endpoints. Every capability below already exists and is
  scoped/filtered server-side exactly as `MOBILE_API_GUIDE.md` describes;
  this is a frontend-only effort that consumes those same routes through
  the existing `apiClient`/`/api/proxy/v1/**` cookie session, same as the
  admin dashboard does today.

## Scope — what the replica covers

Mirrors `MOBILE_API_GUIDE.md` §5's endpoint list exactly, one simplified
web page/flow per area:

| Area | Capability | Backing endpoints (unchanged) |
|---|---|---|
| Sales | list (own store), create, view detail, confirm/complete/cancel/process/pack/ship/deliver | `/sales`, `/sales/{id}`, `/sales/{id}/{action}` |
| Sale returns | list, create, view | `/sale-returns`, `/sale-returns/{id}` |
| Purchases | list, create, view, confirm/cancel/receive | `/purchases`, `/purchases/{id}`, `/purchases/{id}/{action}` |
| Purchase returns | list, create, view | `/purchase-returns`, `/purchase-returns/{id}` |
| Inventory | balance for own store, create stock adjustment | `/inventory/balance`, `/stock-adjustments` |
| Stock transfers | list (either side of own store), create, ship, receive, cancel | `/stock-transfers`, `/stock-transfers/{id}`, `/stock-transfers/{id}/{action}` |
| Warehouses | read-only, own store only | `/warehouses`, `/warehouses/{id}` |

Every one of these is already warehouse-scoped/filtered server-side
(`shared/utils/assert-warehouse-access.ts`) — the new frontend doesn't
add any scoping logic of its own, it just doesn't need to show a
warehouse picker where the admin dashboard does, since there's only ever
one possible value.

## Where it lives

New route area, working title **`/store/**`**, alongside the existing
`app/(dashboard)/**`:

```
app/(store)/store/sales/page.tsx
app/(store)/store/sales/[id]/page.tsx
app/(store)/store/purchases/page.tsx
...
```

Same Next.js app, same build, same deploy — just a second route group
with its own layout (a simpler header/nav than `components/layout/
sidebar.tsx`, sized for fewer, bigger, task-oriented links) sitting next
to the dashboard's. Reuses the same auth: `/login`, the same httpOnly
session cookies, the same `/api/proxy/v1/**` translation layer, the same
`useAuth()`/`apiClient`. No second login, no second token type.

**Open design question for the implementation plan**: how does a user
get to `/store` vs `/(dashboard)`? Leaning toward *not* auto-redirecting
based on `warehouseId` (that's surprising for a tenant admin who also
happens to have a `warehouseId` set for some other reason, and forecloses
an admin ever wanting the simplified view) — instead, a visible link each
side ("Switch to Store view" from the dashboard sidebar; "Full dashboard"
from the store header) so it's the user's choice, gated only by whether
they hold the relevant permissions either place already checks.

## What "simplified" concretely means

- Lists default-filtered to the caller's own warehouse with no picker to
  change it (there's nothing else to pick).
- Create-sale flow closer to a checkout flow than an admin form: product
  search/scan-friendly line entry, minimal required fields, sensible
  defaults (today's date, the user's own warehouse pre-filled and not
  editable).
- Bigger touch targets, fewer visible columns per list, action buttons
  for the lifecycle verbs (Confirm/Ship/Receive/etc.) front-and-center
  rather than tucked into a row-actions menu.
- No relation pickers the Store Manager permission set has no reason to
  touch (no category/brand/tax-rate management surfaces here at all —
  those are selected *from* existing catalog data when building a sale/
  purchase line, never created/edited from this area).

## Next steps

1. Detailed implementation plan (routes, layout/nav component, one page
   per area above, which existing components can be reused vs. need a
   simplified variant) — via the standard plan-mode flow.
2. User confirms the plan.
3. Build, verify (`tsc`/`eslint`/`vitest`/`build` + a live smoke test
   logged in as a warehouse-scoped user), same as every other feature
   this session.
