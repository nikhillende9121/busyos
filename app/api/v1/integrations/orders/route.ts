import { orderIngestionController } from "@/modules/webhook/controller/order-ingestion.controller";
import { withWebhookAuth } from "@/shared/middleware/with-webhook-auth";

// A tenant's own website calling INTO this platform to create a real Sale
// — not a browser session, so this deliberately bypasses withApiAuth in
// favor of withWebhookAuth's API-key + HMAC-signature pipeline. See
// Docs/webhooks.md §4.
export const POST = withWebhookAuth(orderIngestionController.create);
