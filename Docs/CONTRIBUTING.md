# CONTRIBUTING.md

Audience: developers contributing to this repository.

---

## Branch Strategy

```text
main       — always deployable
develop    — integration branch for the next release
feature/*  — one branch per feature or fix, cut from develop
```

Naming: `feature/<module>-<short-description>`, e.g. `feature/inventory-stock-transfer`.

## Pull Request Rules

Every PR must:

- Compile successfully (`npm run build`).
- Pass linting (`npm run lint`).
- Pass tests for any touched module.
- Not introduce duplicated business logic (check whether an existing service
  already does this before writing a new one).
- Follow the module structure and layering rules in `AI_AGENT.md`.

## Code Review Checklist

Before approving a PR, confirm:

- [ ] Controller contains no business logic, no Prisma calls.
- [ ] Repository contains only database code — no business rules, no
      permission/feature checks.
- [ ] Service owns the workflow and all business validation.
- [ ] Every new/changed query is scoped by `tenant_id` (or is explicitly
      Super Admin-only, and that's intentional).
- [ ] RBAC checked for every new mutating endpoint.
- [ ] Feature flag checked where the module is plan-gated.
- [ ] No duplicated utilities — reused an existing `shared/` helper where one
      already existed.
- [ ] Naming conventions followed (see `MODULE_GUIDE.md`).
- [ ] New tables include `tenant_id` (if business data), `created_at`,
      `updated_at`, and appropriate indexes (see `DATABASE.md`).

## Commit Convention

[Conventional Commits](https://www.conventionalcommits.org/):

```text
feat:      new feature
fix:       bug fix
refactor:  no behavior change
docs:      documentation only
test:      adding/fixing tests
chore:     tooling, deps, config
```

Scoped to the module when applicable:

```text
feat(product): add barcode support
fix(inventory): prevent negative stock
refactor(auth): simplify JWT validation
docs(database): document partitioning plan for inventory_transactions
```

## Local Setup

See the root `README.md` for install/env/run instructions.
