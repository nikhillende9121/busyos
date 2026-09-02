import { webhookController } from "@/modules/webhook/controller/webhook.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(webhookController.list, {
  feature: "WEBHOOK",
  permission: "WEBHOOK.VIEW",
});

export const POST = withApiAuth(webhookController.create, {
  feature: "WEBHOOK",
  permission: "WEBHOOK.CREATE",
});
