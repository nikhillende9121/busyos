import { webhookController } from "@/modules/webhook/controller/webhook.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(webhookController.getIntegration, {
  feature: "WEBHOOK",
  permission: "WEBHOOK.VIEW",
});

export const POST = withApiAuth(webhookController.createIntegration, {
  feature: "WEBHOOK",
  permission: "WEBHOOK.CREATE",
});

export const PUT = withApiAuth(webhookController.updateIntegration, {
  feature: "WEBHOOK",
  permission: "WEBHOOK.UPDATE",
});
