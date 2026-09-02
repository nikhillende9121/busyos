import { webhookController } from "@/modules/webhook/controller/webhook.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const POST = withApiAuth<Params>(webhookController.sendTest, {
  feature: "WEBHOOK",
  permission: "WEBHOOK.VIEW",
});
