# MODULES.md

> This file defines the module rules. For the step-by-step creation
> checklist and a worked example, see
> [`Docs/MODULE_GUIDE.md`](Docs/MODULE_GUIDE.md).

# Module Development Guide

## Purpose

This document defines what a **module** is, how it should be structured, and how new modules must be implemented.

Every business feature in the application must belong to exactly one module.

The goal is to keep modules **independent, maintainable, reusable, and scalable**.

---

# What is a Module?

A module represents a single business domain.

Examples

* Product
* Inventory
* Purchase
* Sales
* Warehouse
* Supplier
* Customer
* Reports
* Authentication

Each module owns its own:

* Business logic
* Database access
* Validation
* API
* UI Components
* Types
* Utilities

A module should be understandable without reading the rest of the application.

---

# Module Structure

Every module must follow the same directory structure.

```text
modules/

    product/

        controller/

        service/

        repository/

        dto/

        schema/

        types/

        components/

        hooks/

        utils/

        tests/
```

Every new module must follow this structure unless approved otherwise.

---

# Folder Responsibilities

## controller/

Handles incoming HTTP requests.

Responsibilities

* Receive request
* Parse request
* Call service
* Return response

Must NOT

* Access Prisma
* Contain business logic
* Check permissions
* Perform feature validation

---

## service/

Contains all business logic.

Responsibilities

* Business rules
* Validation beyond schema validation
* Workflow orchestration
* Calling repositories
* Calling other module services
* Raising domain events

Services are the heart of every module.

Must NOT

* Receive HTTP requests directly
* Use Prisma directly

---

## repository/

Handles database operations.

Responsibilities

* Prisma queries
* Transactions
* Data persistence
* Data retrieval

Must NOT

* Contain business logic
* Perform permission checks
* Perform tenant validation

Repositories should only answer one question:

> How is the data stored?

---

## dto/

Data Transfer Objects.

DTOs define the data exchanged between layers.

DTOs isolate Services from HTTP requests.

Never pass Request objects directly into Services.

---

## schema/

Contains request validation.

Use Zod for validation.

Responsibilities

* Validate input
* Validate API payloads
* Validate query parameters

Business validation belongs in Services.

---

## types/

Contains shared TypeScript types used by the module.

Examples

* Interfaces
* Enums
* Response types
* Filter types

---

## components/

Contains reusable React components owned by the module.

Examples

* ProductForm
* ProductTable
* ProductCard

Business-specific UI belongs here.

Shared UI belongs in `shared/components`.

---

## hooks/

Contains reusable React hooks.

Examples

* useProducts()
* useCreateProduct()
* useInventory()

Hooks should only contain frontend logic.

---

## utils/

Contains helper functions specific to the module.

Examples

* SKU Generator
* Barcode Generator
* Product Formatter

Do not place shared utilities here.

---

## tests/

Contains unit and integration tests for the module.

Tests should cover

* Services
* Repositories
* Utilities

---

# Module Ownership

Every file belongs to exactly one module.

Example

```text
ProductForm

↓

Product Module
```

Not

```text
shared/

product/

misc/
```

If ownership is unclear, the architecture needs reconsideration.

---

# Module Independence

Each module should be independently understandable.

Good

```text
Sales

↓

Inventory Service
```

Bad

```text
Sales

↓

Inventory Repository
```

Modules communicate through Services.

Repositories are private implementation details.

---

# Public API of a Module

Only expose what other modules need.

Example

```text
ProductService

create()

update()

delete()

findById()
```

Other modules should never call internal helpers or repositories.

---

# Module Communication

Allowed

```text
Sales Service

↓

Inventory Service

↓

Inventory Repository
```

Not Allowed

```text
Sales Service

↓

Inventory Repository
```

Never bypass another module's Service layer.

---

# Shared Code

If code is reused by multiple modules, move it to `shared/`.

Examples

```text
shared/

auth/

logger/

errors/

cache/

utils/

components/
```

Do not move business logic into `shared/`.

---

# Module Dependencies

A module should depend on as few modules as possible.

Example

```text
Purchase

↓

Supplier

↓

Product

↓

Inventory
```

Avoid circular dependencies.

Example

```text
Product

↓

Inventory

↓

Product
```

This is not allowed.

---

# Module Naming

Folder names

```text
product

inventory

purchase

warehouse
```

Singular names are preferred.

Files

```text
product.service.ts

product.repository.ts

product.controller.ts

product.schema.ts
```

Keep naming consistent across all modules.

---

# Creating a New Module

When creating a new module, complete the following checklist.

* Create module folder.
* Create standard directory structure.
* Create API routes.
* Create controller.
* Create service.
* Create repository.
* Create schemas.
* Create DTOs.
* Create types.
* Create tests.
* Register permissions.
* Register feature (if applicable).
* Update seeders.
* Update documentation.

---

# Module Lifecycle

A typical request should flow as follows.

```text
Client

↓

API Route

↓

Controller

↓

Service

↓

Repository

↓

Database

↓

Response
```

Every module should follow this pattern.

---

# Testing Strategy

Each module should be testable independently.

Minimum tests

* Service tests
* Repository tests
* Utility tests

Business rules should always be covered by tests.

---

# AI Agent Rules

When generating or modifying a module:

1. Follow the standard module structure exactly.
2. Keep controllers thin.
3. Place all business rules in Services.
4. Place all database logic in Repositories.
5. Use Zod for validation.
6. Do not duplicate logic from another module.
7. Reuse existing Services where appropriate.
8. Never access another module's Repository directly.
9. Keep modules loosely coupled.
10. Maintain tenant isolation and RBAC compliance.

---

# Guiding Principles

* One business domain = One module.
* One responsibility per layer.
* Modules communicate through Services.
* Repositories are private to their module.
* Business logic belongs only in Services.
* Shared code belongs in `shared/`, not inside modules.
* Every module should be easy to understand, test, and extend without affecting unrelated modules.
