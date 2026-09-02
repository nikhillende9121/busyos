import { webhookController } from "@/modules/webhook/controller/webhook.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const POST = withApiAuth(webhookController.regenerateSecret, {
  feature: "WEBHOOK",
  permission: "WEBHOOK.UPDATE",
});
