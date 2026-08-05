AI_AGENT.md
Inventory Management System - Architecture
Rules
Purpose
This document defines the architecture, project structure, and development rules that every AI agent
and developer must follow.
These rules are mandatory unless explicitly overridden by the project owner.
Technology Stack
Next.js (App Router)
TypeScript
Prisma ORM
MySQL
React
Tailwind CSS
Zod
JWT Authentication
Architecture
The application follows a Modular Feature-Based Architecture.
Every business domain is isolated inside its own module.
Never organise code by technical layers globally.
 Incorrect
controllers/
services/
repositories/
models/
 Correct
•
•
•
•
•
•
•
•
1
modules/
 product/
 inventory/
 purchase/
 sales/
 supplier/
 warehouse/
 customer/
 auth/
 tenant/
Every module owns its own logic.
Layer Architecture
Every request follows this flow.
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
Prisma
2
↓
Database
No layer may bypass another layer.
Responsibilities
Route
Responsibilities
HTTP endpoint
Call controller
Must NOT contain
Business logic
Validation
Database queries
Controller
Responsibilities
Receive request
Parse input
Call service
Return response
Must NOT contain
Business rules
Prisma queries
Permission logic
Feature checks
Service
Responsibilities
Business rules
Workflow
Domain validation
•
•
•
•
•
•
•
•
•
•
•
•
•
•
•
•
3
Event orchestration
Must NOT contain
HTTP logic
Prisma queries
Services may call multiple repositories.
Repository
Responsibilities
Prisma
Database queries
Transactions
Must NOT contain
Business logic
Permission logic
Feature logic
Module Structure
Every module MUST follow this structure.
module-name/
controller/
service/
repository/
dto/
schema/
types/
components/
hooks/
utils/
•
•
•
•
•
•
•
•
•
4
tests/
Do not invent new folder structures without approval.
Shared Directory
Common code belongs here.
shared/
auth/
cache/
database/
middleware/
logger/
constants/
errors/
utils/
validation/
Business logic must never exist inside shared.
Multi-Tenant Rules
Architecture
Shared Database
Shared Schema
Every business record MUST belong to a tenant.
Every business table must contain
5
tenant_id
Every database query must be scoped by tenant unless the caller is Super Admin.
Never return records from another tenant.
User Hierarchy
Super Admin
↓
Tenant Admin
↓
Employee
Super Admin can access all tenants.
Tenant Admin can access only their tenant.
Employees are restricted by permissions.
Authorization
Authorization has two separate layers.
Feature Access
Determines whether a tenant owns a module.
Examples
Inventory
Sales
Purchase
CRM
If a feature is disabled
The request must fail before reaching business logic.
•
•
•
•
6
RBAC
Determines what actions a user may perform.
Examples
Product.View
Product.Create
Product.Update
Product.Delete
Inventory.Adjust
Purchase.Create
Permissions never replace feature flags.
Feature access is checked first.
Permission access is checked second.
Request Pipeline
Every request must follow this order.
Authentication
↓
Resolve Tenant
↓
Subscription Validation
↓
Feature Validation
↓
Permission Validation
7
↓
Controller
↓
Service
↓
Repository
↓
Database
Never skip any step.
Database Rules
Use Prisma only.
Never write raw SQL unless absolutely necessary.
Every table must include
created_at
updated_at
Soft delete should be used for recoverable business entities.
Index frequently searched columns.
Always use foreign keys.
Naming Rules
Folders
lowercase
Files
8
product.service.ts
inventory.repository.ts
purchase.controller.ts
Classes
PascalCase
Functions
camelCase
Constants
UPPER_SNAKE_CASE
Database
snake_case
API
kebab-case
Coding Rules
Always
Keep controllers thin.
Keep services focused.
Keep repositories database-only.
Use TypeScript strict mode.
Reuse existing utilities.
Prefer composition over duplication.
Write readable code.
Prefer explicit names over abbreviations.
Never
Put business logic inside controllers.
•
•
•
•
•
•
•
•
•
9
Put Prisma inside React components.
Put business logic inside repositories.
Duplicate business logic.
Hardcode tenant IDs.
Hardcode permissions.
Hardcode feature flags.
Access another module's internal files directly.
Module Communication
A module may use another module only through its public service layer.
Example
Sales
↓
InventoryService
↓
Inventory Repository
Not
Sales
↓
Inventory Repository
Repositories are private implementation details.
UI Rules
Pages should be lightweight.
Business logic belongs in services.
Reusable UI belongs inside the owning module.
Shared UI belongs inside
•
•
•
•
•
•
•
10
shared/components
Error Handling
Throw typed business errors.
Do not return arbitrary error objects.
Use centralised error handling.
Logging
Log
Authentication
Permission failures
Feature failures
Product changes
Inventory changes
Sales
Purchases
User management
Include
tenant_id
user_id
timestamp
Scalability
The architecture must support
Thousands of tenants
Millions of products
Multiple warehouses
Multiple branches
Future microservice migration
Avoid designs that tightly couple modules.
•
•
•
•
•
•
•
•
•
•
•
•
•
•
•
•
11
AI Agent Rules
Before generating code
Search for an existing implementation.
Reuse existing services where possible.
Follow the module structure exactly.
Do not introduce new architectural patterns.
Do not move files unless requested.
Do not duplicate business logic.
Keep code consistent with surrounding modules.
Respect tenant isolation.
Respect feature flags.
Respect RBAC.
If uncertain
Choose consistency with the existing architecture over introducing a new pattern.
Guiding Principle
Every module should be independently understandable, independently testable, and loosely
coupled. Business rules belong in services, persistence belongs in repositories, and every
operation must enforce tenant isolation, feature access, and RBAC before executing business
logic.
1.
2.
3.
4.
5.
6.
7.
8.
9.
10.
12