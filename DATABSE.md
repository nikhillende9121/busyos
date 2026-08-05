# DATABASE.md

> This file defines the original database design rules. The implemented
> schema lives in [`prisma/schema.prisma`](prisma/schema.prisma); the
> decisions behind it (ID strategy, indexing, partitioning, transactions)
> are documented in [`Docs/DATABASE.md`](Docs/DATABASE.md).

# Database Design & Relationships

## Purpose

This document defines the database structure, relationships, and ownership of all core entities.

The goal is to maintain a **consistent, scalable, and tenant-safe** database design.

---

# Database Architecture

The application follows a **Shared Database, Shared Schema** multi-tenant architecture.

```text
                     MySQL Database
                            │
        ┌───────────────────┼────────────────────┐
        │                   │                    │
   System Tables      Tenant Tables      Business Tables
```

---

# Table Categories

## 1. System Tables

These tables belong to the platform.

Only **Super Admin** manages them.

Examples

```text
plans
features
permissions
plan_features
system_settings
```

These tables **do not contain tenant_id**.

---

## 2. Tenant Tables

These tables define each customer (tenant).

Examples

```text
tenants
tenant_settings
tenant_features
tenant_subscriptions
```

---

## 3. Business Tables

Every business record belongs to a tenant.

Examples

```text
products
categories
customers
suppliers
purchases
sales
inventory_transactions
warehouses
```

Every business table **must contain**

```text
tenant_id
```

---

# Core Entity Relationship

```text
Super Admin

│

└── Tenants

      │

      ├── Users

      ├── Warehouses

      ├── Categories

      ├── Products

      ├── Customers

      ├── Suppliers

      ├── Purchases

      ├── Sales

      └── Inventory
```

---

# Authentication

## users

```text
id

tenant_id

role_id

name

email

password

status
```

Relationship

```text
Tenant

↓

Users

↓

Role
```

---

## roles

```text
id

tenant_id

name

code
```

Relationship

```text
Role

↓

Role Permissions
```

---

## permissions

```text
id

module

action

code
```

Example

```text
PRODUCT.CREATE

PRODUCT.UPDATE

PRODUCT.DELETE

PRODUCT.VIEW
```

---

## role_permissions

```text
role_id

permission_id
```

Many-to-many.

---

# Tenant Management

## tenants

```text
id

name

code

status
```

---

## tenant_settings

Stores company-specific configuration.

Examples

```text
Company Name

GST

Currency

Timezone

Invoice Prefix

Decimal Precision
```

---

## tenant_features

Maps enabled features.

```text
tenant_id

feature_id

enabled
```

---

## tenant_subscriptions

```text
tenant_id

plan_id

start_date

end_date

status
```

---

# Subscription

## plans

```text
id

name

price

billing_cycle
```

---

## features

```text
id

name

code
```

---

## plan_features

```text
plan_id

feature_id
```

Defines which modules belong to a plan.

---

# Warehouse

## warehouses

```text
id

tenant_id

name

code

address
```

Relationship

```text
Tenant

↓

Warehouse

↓

Inventory
```

---

# Product

## categories

```text
id

tenant_id

parent_id

name
```

---

## brands

```text
id

tenant_id

name
```

---

## units

```text
id

name

symbol
```

Usually shared system data.

---

## products

```text
id

tenant_id

category_id

brand_id

unit_id

sku

barcode

name

status
```

Relationship

```text
Category

↓

Product

↓

Inventory
```

---

# Inventory

## inventory_balance

Current stock.

```text
id

tenant_id

warehouse_id

product_id

quantity
```

---

## inventory_transactions

Stock movement history.

```text
id

tenant_id

warehouse_id

product_id

transaction_type

quantity

reference_type

reference_id
```

Every stock movement creates one record.

Never update history.

---

## stock_adjustments

```text
id

tenant_id

warehouse_id

reason

created_by
```

---

## stock_adjustment_items

```text
adjustment_id

product_id

quantity
```

---

# Supplier

## suppliers

```text
id

tenant_id

name

email

phone
```

---

# Customer

## customers

```text
id

tenant_id

name

phone

email
```

---

# Purchase

## purchases

```text
id

tenant_id

supplier_id

warehouse_id

status

purchase_date
```

---

## purchase_items

```text
purchase_id

product_id

quantity

price

tax
```

One Purchase

↓

Many Purchase Items

---

# Sales

## sales

```text
id

tenant_id

customer_id

warehouse_id

status

sale_date
```

---

## sale_items

```text
sale_id

product_id

quantity

price

tax
```

---

# Returns

## purchase_returns

```text
id

purchase_id

reason
```

---

## sale_returns

```text
id

sale_id

reason
```

---

# Payments

## payments

```text
id

tenant_id

reference_type

reference_id

amount

payment_method
```

Supports

* Purchase
* Sale
* Refund

---

# Audit

## audit_logs

```text
id

tenant_id

user_id

action

entity

entity_id

old_value

new_value

created_at
```

Every important business action should be logged.

---

# Notifications

## notifications

```text
id

tenant_id

user_id

title

message

is_read
```

---

# File Storage

## attachments

```text
id

tenant_id

entity

entity_id

file_name

path
```

Used for

* Purchase Invoice
* Product Image
* Documents

---

# System Relationships

```text
Plan

↓

Plan Features

↓

Tenant Subscription

↓

Tenant

↓

Tenant Features

↓

Users

↓

Roles

↓

Permissions
```

---

# Inventory Relationships

```text
Category

↓

Product

↓

Inventory Balance

↓

Inventory Transactions
```

---

# Purchase Flow

```text
Supplier

↓

Purchase

↓

Purchase Items

↓

Inventory Transactions

↓

Inventory Balance
```

---

# Sales Flow

```text
Customer

↓

Sale

↓

Sale Items

↓

Inventory Transactions

↓

Inventory Balance
```

---

# Warehouse Flow

```text
Warehouse

↓

Products

↓

Stock

↓

Transfers

↓

Adjustments
```

---

# Required Columns

Every business table should contain

```text
id

tenant_id

created_at

updated_at

created_by

updated_by
```

Optional

```text
deleted_at
```

Use soft deletes where recovery is required.

---

# Index Recommendations

Always index

```text
tenant_id

sku

barcode

warehouse_id

customer_id

supplier_id

status

created_at
```

Use composite indexes where tenant filtering is common.

Example

```text
tenant_id + sku

tenant_id + barcode

tenant_id + warehouse_id
```

---

# Foreign Key Rules

Always use foreign keys.

Example

```text
products.category_id

↓

categories.id
```

Never store orphan records.

---

# Transaction Rules

Use database transactions for

* Purchase creation
* Sales creation
* Inventory adjustment
* Warehouse transfer
* Payment posting

All related records must commit or roll back together.

---

# Future Modules

Reserve the database for future expansion.

Possible additions

* Manufacturing
* CRM
* HRMS
* Payroll
* Service Management
* POS
* Loyalty
* E-commerce
* Accounting

Design current tables so they can integrate with future modules.

---

# AI Agent Rules

When creating a new table:

1. Determine whether it is a **System**, **Tenant**, or **Business** table.
2. Add `tenant_id` to every business table.
3. Define foreign keys for all relationships.
4. Add timestamps.
5. Add indexes for commonly queried columns.
6. Use lookup tables instead of hardcoded values.
7. Use junction tables for many-to-many relationships.
8. Never duplicate master data.
9. Preserve referential integrity.
10. Keep the schema normalised unless denormalisation is justified for performance.

---

# Guiding Principles

* Every business record belongs to one tenant.
* Every relationship should be explicit.
* Inventory is event-driven through transaction history.
* Business data is isolated by `tenant_id`.
* Database design should prioritise integrity, scalability, and auditability over short-term convenience.
