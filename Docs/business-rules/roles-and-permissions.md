# Business Rules — Roles & Permissions

## Two Distinct Layers, Not One

- **`Permission`** — a fixed, platform-wide catalog (`module.action` codes
  like `PRODUCT.VIEW`, `SALE.CONFIRM`), seeded once in `prisma/seed.ts` and
  never tenant-owned. A tenant cannot invent a new permission code — the
  catalog only grows when a new API route is added and its permission code
  is added to `PERMISSION_CODES`.
- **`Role`** — tenant-owned (`Role.tenantId`, `@@unique([tenantId, code])`).
  Each tenant builds its own set of roles independently; deleting or
  editing Tenant A's "Manager" role never touches Tenant B's role of the
  same name. `RolePermission` is the join table choosing which of the
  fixed platform codes a given role grants.

A tenant admin manages **which of the fixed codes apply to which of their
own staff** — not the codes themselves.

## A Role's Permission Set Is Replaced, Not Diffed

`PUT /api/v1/roles/:id` with a `permissionCodes` array **replaces** the
role's entire grant set (delete all `RolePermission` rows for that role,
then re-insert) rather than diffing against the existing set — simpler and
more predictable than computing an add/remove diff, at the cost that
omitting the field (vs. sending an empty array) means two different
things: omit = leave permissions untouched, `[]` = revoke everything.

Every submitted code is validated against the live `Permission` catalog
before anything is written — an unknown/typo'd code fails the whole
request (`VALIDATION_ERROR`), rather than silently granting a
smaller-than-intended set.

## Deleting a Role Is Blocked, Not Cascaded

Same principle as `Warehouse` (see `Docs/DATABASE.md` -> Foreign Key
Rules): a `Role` still assigned to any non-deleted `User` cannot be
soft-deleted — the caller must reassign those users to a different role
first. Silently cascading would leave active accounts with an undefined
permission set.

## User Management Is Deliberately Narrow in v1

- `POST /api/v1/users` is the only way to set a password — hashed via
  `modules/auth/utils/password.util.ts`'s `hashPassword` (the same
  function `modules/auth`'s login flow verifies against), never stored or
  returned in plaintext.
- `PUT /api/v1/users/:id` can change `name`, `roleId`, and `status`
  (`ACTIVE`/`INACTIVE`/`INVITED`) — **not** `email` or `password`. An email
  change has identity implications (it's part of the login lookup key,
  `@@unique([tenantId, email])`) and a password reset deserves its own
  flow (e.g. a reset-token email), neither of which exists yet. Flagged
  here rather than silently omitted.
- Deleting a user is a plain soft delete with no "last remaining admin"
  guard — a tenant can lock itself out by deleting its only active user
  with `ROLE`/`USER` permissions. A real but rare edge case, deliberately
  left unhandled in v1 rather than adding speculative protection.

## Permissions Are Checked Fresh, Never Cached in the JWT

See `shared/middleware/rbac-lookup.ts` and `Docs/ARCHITECTURE.md` ->
Request Pipeline: a role's permission set is queried from the database on
every request, not embedded in the access token. Editing a role's
permissions (or moving a user to a different role) takes effect on that
user's very next request — no re-login required, and no stale-token
window to reason about.
