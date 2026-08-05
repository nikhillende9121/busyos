# 0001: Modular Feature-Based Architecture over Layered-by-Technology

## Status

Accepted (already encoded in `AI_AGENT.md`/`MODULES.md`; recorded here as the
formal decision record).

## Context

A traditional Next.js/Node backend is often organized by technical layer
globally (`controllers/`, `services/`, `repositories/`, `models/` at the
project root). As the number of business domains grows (product, inventory,
purchase, sales, supplier, warehouse, customer...), that structure means
every new feature touches four unrelated top-level folders, and nothing
prevents one domain's service from silently reaching into another domain's
repository.

## Decision

Organize by business domain first: `modules/<domain>/{controller,service,
repository,dto,schema,types,components,hooks,utils,tests}`. Cross-module
calls are only allowed through another module's service, never its
repository.

## Consequences

- A developer (or AI agent) can understand, test, and modify one module
  without reading the rest of the codebase.
- Extracting a module into its own microservice later means swapping an
  in-process import for an HTTP call at the service boundary — see
  `ARCHITECTURE.md` → Future Microservice Strategy.
- Trade-off: some cross-cutting technical concerns (e.g. "list every API
  route in the app") require walking every module folder instead of reading
  one `controllers/` directory. Mitigated by `API_STANDARDS.md` maintaining
  a single endpoint map.
