# MODULE_GUIDE.md

Audience: developers creating or modifying a module. This is the canonical,
step-by-step companion to the rules already defined in `MODULES.md` (root) —
read that first for *why* the structure looks like this; this document is the
*how* checklist plus a worked example.

---

## Checklist: Creating a New Module

Copy this list into the PR description when scaffolding a module.

- [ ] Create `modules/<name>/` with the standard subfolders (see below).
- [ ] Create API route(s) under `app/api/v1/<resource>/`.
- [ ] Create `controller/<name>.controller.ts`.
- [ ] Create `service/<name>.service.ts`.
- [ ] Create `repository/<name>.repository.ts`.
- [ ] Create `schema/<name>.schema.ts` (Zod).
- [ ] Create `dto/<name>.dto.ts`.
- [ ] Create `types/<name>.types.ts`.
- [ ] Create `tests/` covering service + repository + utils.
- [ ] Register permissions in the `permissions` table/seed
      (`<MODULE>.VIEW/CREATE/UPDATE/DELETE`, plus any module-specific actions
      like `INVENTORY.ADJUST`).
- [ ] Register the feature in `features` / `plan_features` if it should be
      plan-gated.
- [ ] Update seeders (roles, demo tenant data) if applicable.
- [ ] Add the module to `Docs/ARCHITECTURE.md`'s module list if it introduces
      a new cross-module dependency.

---

## Worked Example: Scaffolding `modules/product/`

```text
modules/product/
├── controller/
│   └── product.controller.ts      # parse request → call service → respond
├── service/
│   └── product.service.ts         # SKU uniqueness, category validation, events
├── repository/
│   └── product.repository.ts      # Prisma queries, always scoped by tenantId
├── dto/
│   └── product.dto.ts             # CreateProductDto, UpdateProductDto
├── schema/
│   └── product.schema.ts          # Zod: createProductSchema, updateProductSchema
├── types/
│   └── product.types.ts           # ProductFilter, ProductResponse
├── components/
│   ├── ProductForm.tsx
│   ├── ProductTable.tsx
│   └── ProductCard.tsx
├── hooks/
│   ├── useProducts.ts
│   └── useCreateProduct.ts
├── utils/
│   └── sku-generator.ts
└── tests/
    ├── product.service.test.ts
    └── product.repository.test.ts
```

`app/api/v1/products/route.ts` and `app/api/v1/products/[id]/route.ts` are
thin — they only import `product.controller.ts` and forward the
request/response. No Prisma import, no business logic, ever, at that layer.

---

## Public API Surface

Only the service's exported methods are the module's public API. Everything
else (`repository/`, internal `utils/`) is a private implementation detail
other modules must not import.

```text
ProductService
  create(dto): Promise<Product>
  update(id, dto): Promise<Product>
  delete(id): Promise<void>
  findById(id): Promise<Product | null>
  findBySku(tenantId, sku): Promise<Product | null>
```

`PurchaseService` needing to validate a product exists calls
`ProductService.findById()` — it never imports `product.repository.ts`
directly, even though that would "work" today. The point isn't that it's
technically impossible; it's that bypassing the service is the one thing that
breaks the microservice-extraction path described in `ARCHITECTURE.md`.

---

## Dependency Direction

Keep the dependency graph a DAG. Current expected direction:

```text
Purchase → Supplier → Product → Inventory
Sales    → Customer → Product → Inventory
```

If you find yourself needing `Inventory → Product` (the reverse of the
existing `Product → Inventory` direction), stop — that's a circular
dependency and a sign the shared concept belongs in `shared/` or the
boundary needs rethinking, not a new import.

---

## Naming Reference

| Item      | Convention        | Example                    |
| --------- | ------------------ | --------------------------- |
| Folder    | lowercase, singular | `product`, `purchase`       |
| Service   | `<name>.service.ts` | `product.service.ts`        |
| Repository| `<name>.repository.ts` | `inventory.repository.ts` |
| Controller| `<name>.controller.ts` | `purchase.controller.ts` |
| Schema    | `<name>.schema.ts` | `product.schema.ts`         |
| Class     | PascalCase         | `ProductService`             |
| Function  | camelCase          | `createProduct()`             |
| Constant  | UPPER_SNAKE_CASE   | `MAX_SKU_LENGTH`             |
| DB table  | snake_case         | `inventory_transactions`    |
| API route | kebab-case, plural | `/api/v1/purchase-returns`  |
