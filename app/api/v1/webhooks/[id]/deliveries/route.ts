import { webhookController } from "@/modules/webhook/controller/webhook.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(webhookController.listDeliveries, {
  feature: "WEBHOOK",
  permission: "WEBHOOK.VIEW",
});
