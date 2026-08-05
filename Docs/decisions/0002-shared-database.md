# 0002: Shared Database, Shared Schema Multi-Tenancy

## Status

Accepted (already encoded in `AI_AGENT.md`/`DATABSE.md`; recorded here as the
formal decision record).

## Context

Three standard multi-tenancy models were available:

1. **Database-per-tenant** — strongest isolation, but connection pooling and
   migrations don't scale past a few hundred tenants, and cross-tenant
   reporting (as Super Admin) requires fan-out queries across databases.
2. **Schema-per-tenant** (same DB, one schema/namespace per tenant) — better
   than database-per-tenant, but MySQL has no first-class "schema" isolation
   the way Postgres does, and migrations still must run per-schema.
3. **Shared database, shared schema** — every tenant's rows live in the same
   tables, separated by a `tenant_id` column.

## Decision

Shared database, shared schema. Every business table carries `tenant_id`;
every repository query filters by it unless the caller is explicitly Super
Admin.

## Consequences

- One connection pool, one set of migrations, trivial cross-tenant reporting
  for Super Admin — this is what lets the platform target "thousands of
  tenants" without a proportional increase in operational complexity.
- Isolation is enforced by application code, not the database engine. A
  missing `tenant_id` filter in a repository method is a cross-tenant data
  leak, not merely a logic bug — see `ARCHITECTURE.md` → Multi-Tenant Model
  for why this must be treated with that severity in code review.
- Composite indexes on `(tenant_id, ...)` are mandatory on every hot query
  path (see `DATABASE.md` → Index Strategy) — without them, tenant-scoped
  queries degrade as the *total* row count across all tenants grows, even if
  any single tenant's data is small.
- Revisit this decision only if a specific tenant's compliance requirements
  (e.g. data residency) demand physical isolation — that tenant would need a
  dedicated database as an exception, not a wholesale architecture change.
