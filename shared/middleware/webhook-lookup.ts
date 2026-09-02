import { prisma } from "@/shared/database/prisma";

// Narrow, mockable DB read used only by the inbound-order request
// pipeline (with-webhook-auth.ts) — same "kept separate from any module's
// repository" reasoning as rbac-lookup.ts.
export const webhookLookup = {
  findIntegrationByApiKey(apiKey: string) {
    return prisma.tenantWebhookIntegration.findUnique({ where: { apiKey } });
  },
};
