# API_STANDARDS.md

Audience: backend developers. Defines REST conventions for every module's API
routes under `app/api/`.

---

## Versioning

All routes are prefixed `/api/v1/...`. Breaking changes ship as `/api/v2/...`
alongside the old version until clients migrate — never mutate `v1` response
shapes in place.

## Resource Naming

Plural nouns, kebab-case, nested only one level deep:

```text
GET    /api/v1/products
GET    /api/v1/products/{id}
POST   /api/v1/products
PUT    /api/v1/products/{id}
DELETE /api/v1/products/{id}

GET    /api/v1/purchase-returns
POST   /api/v1/stock-adjustments
POST   /api/v1/stock-transfers
```

Action-style endpoints that don't map to CRUD use a verb sub-path:

```text
POST /api/v1/purchases/{id}/receive
POST /api/v1/sales/{id}/cancel
POST /api/v1/inventory/{productId}/adjust
```

## Planned Endpoint Map (initial modules)

```text
auth        POST   /api/v1/auth/login
            POST   /api/v1/auth/refresh
            POST   /api/v1/auth/logout

tenant      GET    /api/v1/tenants/me
            PUT    /api/v1/tenants/me/settings

product     GET    /api/v1/products
            POST   /api/v1/products
            GET    /api/v1/products/{id}
            PUT    /api/v1/products/{id}
            DELETE /api/v1/products/{id}

inventory   GET    /api/v1/inventory/balance?warehouseId=&productId=
            POST   /api/v1/stock-adjustments
            POST   /api/v1/stock-transfers

purchase    POST   /api/v1/purchases
            POST   /api/v1/purchases/{id}/receive
            POST   /api/v1/purchase-returns

sales       POST   /api/v1/sales
            POST   /api/v1/sales/{id}/confirm
            POST   /api/v1/sale-returns

supplier    GET/POST/PUT/DELETE  /api/v1/suppliers
customer    GET/POST/PUT/DELETE  /api/v1/customers
warehouse   GET/POST/PUT/DELETE  /api/v1/warehouses
```

## Request Rules

- `GET` list endpoints accept `page`, `pageSize`, `sortBy`, `sortDir`, and
  module-specific filters as query params (e.g. `?status=ACTIVE&categoryId=3`).
- High-volume/transactional resources (sales, purchases, purchase returns,
  sale returns, sale exchanges, stock transfers, customers, discounts,
  coupons, products) additionally accept `dateFrom`/`dateTo`, filtering on
  that resource's own natural date field (`saleDate`, `purchaseDate`,
  `createdAt`, ...) — see `shared/validation/list-query.ts`'s
  `paginationQueryFields`/`dateRangeQueryFields`, spread into each
  resource's own list-query schema rather than duplicated per module.
  `dateFrom`/`dateTo` are never an entity's own business-data date range
  (e.g. a `Discount`'s `startDate`/`endDate` validity window) — those stay
  separate, unrelated concepts.
- Mutating endpoints (`POST`/`PUT`/`DELETE`) validate the body against the
  module's Zod schema in `schema/` before it reaches the controller's parsed
  DTO.
- `tenant_id` is **never** accepted from the client — it is always resolved
  from the authenticated JWT, never from a request body or query param.

## Response Envelope

Every response uses the same shape, success or failure:

```json
{
  "success": true,
  "data": {},
  "message": "Product created"
}
```

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "sku is required",
    "details": [{ "field": "sku", "message": "Required" }]
  }
}
```

List endpoints wrap `data` with pagination metadata:

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": { "page": 1, "pageSize": 20, "total": 134, "totalPages": 7 }
  }
}
```

## List Export

Every resource listed above under "high-volume/transactional resources"
also exposes `GET /<resource>/export` — a sibling route next to the list
route (e.g. `app/api/v1/sales/export/route.ts` beside
`app/api/v1/sales/route.ts`), not a query flag on the list route itself.

- Accepts the exact same filters as the list endpoint (including
  `dateFrom`/`dateTo`) **minus** `page`/`pageSize`/`sortBy`/`sortDir` — an
  export always returns every row matching the filters, never one page.
  This is the entire reason export exists: filtering a large dataset down
  to a manageable CSV, not re-exporting whatever happened to be on screen.
- On success, the response is **not** the usual `{success, data, message}`
  envelope — it's a raw `text/csv; charset=utf-8` body with a
  `Content-Disposition: attachment; filename="..."` header, built via
  `shared/utils/csv.ts`'s `toCsv()` and `shared/utils/api-response.ts`'s
  `csvResponse()`. On failure, it still goes through the normal JSON error
  envelope (`handleRouteError`) — only the success path is a file.
- Gated by the same `<RESOURCE>.VIEW` permission as the list route —
  exporting is still just viewing, in bulk, not a separate permission.
- The frontend's `components/resource/export-button.tsx` triggers this via
  a raw `fetch()` (not `lib/api/client.ts`'s `apiClient`, which always
  calls `response.json()`) to `/api/proxy/v1/<resource>/export`, then turns
  the response body into a browser download.

## HTTP Status Codes

| Code | Meaning                                   |
| ---- | ------------------------------------------ |
| 200  | Success (read/update)                       |
| 201  | Resource created                            |
| 204  | Success, no body (delete)                   |
| 400  | Validation error                            |
| 401  | Not authenticated                            |
| 403  | Authenticated, but feature/permission denied |
| 404  | Resource not found (or not in caller's tenant — never leak existence across tenants) |
| 409  | Conflict (e.g. duplicate SKU within tenant) |
| 422  | Business rule violation (e.g. insufficient stock) |
| 500  | Unhandled server error                       |

A record belonging to another tenant must respond `404`, not `403` — `403`
would confirm the record exists, leaking cross-tenant information through the
error code alone.

## Error Codes

Typed, stable, machine-parseable strings (not raw exception messages) —
thrown from services as typed business errors and mapped to this shape by
centralized error handling (`shared/errors/`). Examples:

```text
VALIDATION_ERROR
UNAUTHENTICATED
FEATURE_NOT_ENABLED
PERMISSION_DENIED
RESOURCE_NOT_FOUND
DUPLICATE_SKU
INSUFFICIENT_STOCK
SUBSCRIPTION_EXPIRED
```
