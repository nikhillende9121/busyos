# Notification System Architecture & Master Plan (`notification_plan.md`)

This document outlines the architecture, data models, event triggers, and API design for integrating push notifications across both the **Store Manager Android App** and the **Web Portal** using **Firebase Cloud Messaging (FCM)** and a Next.js 16 backend.

---

## 1. Executive Summary & Goals

The notification system serves two primary functions:
1. **Real-time Push Notifications**: Instant OS desktop notifications (Web Portal via Service Worker) and native Android system notifications (Android App via FCM).
2. **In-App Notification Feed**: Persistent database-backed notification list and unread badge counters accessible in the Web header bell and Android notification inbox.

### Target Objectives
- **Multi-Tenant Isolation**: Notifications are strictly scoped to `tenantId`.
- **Multi-Device Support**: A user can log in on multiple Android phones/tablets and browser tabs; all active devices receive push dispatches.
- **Warehouse Scoping**: Notifications like Low Stock or Stock Transfer incoming requests are automatically routed to users scoped to the affected warehouse.
- **Deep Linking**: Push payloads contain structured data to navigate directly to the relevant record (e.g. Sale detail, Stock Transfer detail).

---

## 2. System Architecture Overview

```
                                  ┌───────────────────────────┐
                                  │  Firebase Cloud Messaging │
                                  │         (FCM)             │
                                  └──────────────▲────────────┘
                                                 │
                   ┌─────────────────────────────┼─────────────────────────────┐
                   │ Multicast Push Dispatch     │ Register FCM Token          │ Multicast Push Dispatch
                   │ (firebase-admin SDK)        │                             │ (firebase-admin SDK)
                   │                             │                             │
    ┌──────────────┴──────────────┐   ┌──────────┴──────────┐   ┌──────────────▼─────────────┐
    │     Next.js 16 Backend      │   │  Next.js Web Portal │   │ Android App (Kotlin/Jetpack│
    │    Notification Service     │   │   Service Worker    │   │  FirebaseMessagingService) │
    └──────────────▲──────────────┘   └─────────────────────┘   └────────────────────────────┘
                   │
    ┌──────────────┴──────────────┐
    │ Prisma Database (MySQL/     │
    │ Notifications & DeviceTokens│
    └─────────────────────────────┘
```

---

## 3. Database & Data Models

### 3.1 `notifications` Table (Updated)

Stores persistent notification history for in-app bell feed and status tracking.

| Column | Type | Constraints / Details |
|---|---|---|
| `id` | `BigInt` | Primary Key (autoincrement) |
| `tenantId` | `BigInt` | Foreign Key (`tenants.id`, Cascade) |
| `userId` | `BigInt` | Foreign Key (`users.id`, Cascade) |
| `title` | `String` | `VarChar(200)` |
| `message` | `String` | `Text` |
| `type` | `String` | `VarChar(50)` (e.g., `LOW_STOCK`, `STOCK_TRANSFER`, `SALE_STATUS`, `PURCHASE_STATUS`) |
| `data` | `Json?` | Navigation payload e.g. `{"entityId": "123", "route": "STOCK_TRANSFER_DETAIL"}` |
| `isRead` | `Boolean` | `@default(false)` |
| `readAt` | `DateTime?` | Timestamp when user marked notification as read |
| `createdAt` | `DateTime` | `@default(now())` |

Indexes: `@@index([tenantId, userId, isRead])`, `@@index([createdAt])`

### 3.2 `user_devices` Table (Updated)

Stores FCM registration tokens per user device login.

| Column | Type | Constraints / Details |
|---|---|---|
| `id` | `BigInt` | Primary Key (autoincrement) |
| `tenantId` | `BigInt` | Foreign Key (`tenants.id`, Cascade) |
| `userId` | `BigInt` | Foreign Key (`users.id`, Cascade) |
| `deviceId` | `String` | Unique hardware/installation ID (`VarChar(255)`) |
| `fcmToken` | `String` | FCM Registration Token (`VarChar(500)`) |
| `platform` | `String` | `ANDROID` \| `WEB` \| `IOS` |
| `deviceModel` | `String?` | Device info (e.g., "Samsung Galaxy S23", "Chrome 122 Windows") |
| `isActive` | `Boolean` | `@default(true)` |
| `lastLoginAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

Indexes: `@@unique([userId, deviceId])`, `@@unique([userId, fcmToken])`, `@@index([tenantId])`, `@@index([userId, isActive])`

---

## 4. Notification Event Catalog

| Event Code | Trigger Description | Target Recipient(s) | Payload Data | Priority |
|---|---|---|---|---|
| `LOW_STOCK` | Product inventory level falls below minimum reorder point | Store Managers of affected Warehouse + Tenant Admins | `{ entityId: productId, warehouseId: 5, route: "INVENTORY" }` | `HIGH` |
| `STOCK_TRANSFER_REQUESTED` | New stock transfer created targeting a warehouse | Store Managers of destination Warehouse | `{ entityId: transferId, route: "STOCK_TRANSFER_DETAIL" }` | `HIGH` |
| `STOCK_TRANSFER_SHIPPED` | Stock transfer marked as `IN_TRANSIT` | Store Managers of destination Warehouse | `{ entityId: transferId, route: "STOCK_TRANSFER_DETAIL" }` | `HIGH` |
| `STOCK_TRANSFER_RECEIVED` | Stock transfer marked as `COMPLETED` | Store Managers of origin Warehouse | `{ entityId: transferId, route: "STOCK_TRANSFER_DETAIL" }` | `NORMAL` |
| `SALE_STATUS_CHANGED` | Sale updated to `SHIPPED`, `DELIVERED`, or `CANCELLED` | Cashier / Creator of the sale | `{ entityId: saleId, route: "SALE_DETAIL" }` | `NORMAL` |
| `PURCHASE_RECEIVED` | Purchase order received at warehouse | Store Managers of receiving Warehouse | `{ entityId: purchaseId, route: "PURCHASE_DETAIL" }` | `NORMAL` |
| `SYSTEM_ANNOUNCEMENT` | Broad tenant alert from Super Admin or Tenant Admin | All Tenant Users | `{ route: "HOME" }` | `HIGH` |

---

## 5. REST API Specifications (`/api/v1/notifications`)

All endpoints require `Authorization: Bearer <accessToken>`.

### 1. Register FCM Device Token
- **Endpoint**: `POST /api/v1/notifications/device-token`
- **Request Body**:
  ```json
  {
    "deviceId": "android_a1b2c3d4e5",
    "fcmToken": "fcm_token_string_here...",
    "platform": "ANDROID",
    "deviceModel": "Samsung Galaxy S23"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": { "registered": true },
    "message": "Device token registered successfully"
  }
  ```

### 2. Unregister FCM Device Token (Logout)
- **Endpoint**: `DELETE /api/v1/notifications/device-token`
- **Request Body**:
  ```json
  {
    "fcmToken": "fcm_token_string_here..."
  }
  ```
- **Response**: `200 OK`

### 3. List In-App Notifications
- **Endpoint**: `GET /api/v1/notifications?page=1&pageSize=20&unreadOnly=false`
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "101",
          "title": "Low Stock Warning",
          "message": "Item SKU-99 (Wireless Mouse) is below reorder level (Qty: 2 left)",
          "type": "LOW_STOCK",
          "data": { "productId": "45", "route": "INVENTORY" },
          "isRead": false,
          "createdAt": "2026-08-20T14:45:00Z"
        }
      ],
      "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
    }
  }
  ```

### 4. Get Unread Count
- **Endpoint**: `GET /api/v1/notifications/unread-count`
- **Response**: `{ "success": true, "data": { "unreadCount": 3 } }`

### 5. Mark Notification as Read
- **Endpoint**: `PATCH /api/v1/notifications/:id/read`
- **Response**: `{ "success": true, "message": "Notification marked as read" }`

### 6. Mark All Notifications as Read
- **Endpoint**: `PATCH /api/v1/notifications/read-all`
- **Response**: `{ "success": true, "message": "All notifications marked as read" }`

---

## 6. Implementation Roadmap

1. **Phase 1: Backend Infrastructure**
   - Update database schema via Prisma.
   - Configure `firebase-admin` in Next.js backend.
   - Implement `modules/notification` service, controller, and routes.
2. **Phase 2: Web Portal Integration**
   - Implement Web Service Worker (`public/firebase-messaging-sw.js`).
   - Add Notification Provider, Bell component, and Toast notifications.
3. **Phase 3: Android App Integration**
   - Follow the step-by-step Android changes guide in [`notification_androidChanges.md`](file:///c:/Users/CSI/Pro/inventory-management/Docs/notification_androidChanges.md).
   - Test push reception across all app states (Foreground, Background, Killed).
