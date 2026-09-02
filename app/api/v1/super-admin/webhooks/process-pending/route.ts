import { webhookController } from "@/modules/webhook/controller/webhook.controller";
import { withSuperAdminAuth } from "@/shared/middleware/with-super-admin-auth";

// Meant to be invoked periodically by an external scheduler (no
// in-process cron in this codebase) to drain WebhookDelivery rows due for
// a retry — see Docs/webhooks.md §5.
export const POST = withSuperAdminAuth(webhookController.processPending);
