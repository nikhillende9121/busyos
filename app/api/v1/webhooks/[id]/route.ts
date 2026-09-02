import { webhookController } from "@/modules/webhook/controller/webhook.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const PUT = withApiAuth<Params>(webhookController.update, {
  feature: "WEBHOOK",
  permission: "WEBHOOK.UPDATE",
});

export const DELETE = withApiAuth<Params>(webhookController.remove, {
  feature: "WEBHOOK",
  permission: "WEBHOOK.DELETE",
});
