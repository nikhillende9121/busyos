import { superAdminSubscriptionController } from "@/modules/super-admin/controller/subscription.controller";
import { withSuperAdminAuth } from "@/shared/middleware/with-super-admin-auth";

// Meant to be invoked periodically (e.g. daily) by an external scheduler —
// no in-process cron in this codebase, same pattern as
// /api/v1/super-admin/webhooks/process-pending. Notifies each tenant's
// admin(s) once their subscription crosses the 30/7/1-day-remaining or
// already-expired thresholds — see
// modules/super-admin/service/subscription.service.ts's
// processExpiryAlerts.
export const POST = withSuperAdminAuth(superAdminSubscriptionController.processExpiryAlerts);
