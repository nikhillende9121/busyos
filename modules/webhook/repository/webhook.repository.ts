import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import type { Prisma, WebhookEventType } from "@prisma/client";

const includeEventTypesAndLastDelivery = {
  eventTypes: true,
  deliveries: { orderBy: { createdAt: "desc" as const }, take: 1 },
} as const;

// Prisma queries only, tenant-scoped where applicable — see MODULES.md ->
// repository/.
export const webhookRepository = {
  // --- Integration (one per tenant) ---

  findIntegrationByTenant(tenantId: bigint) {
    return prisma.tenantWebhookIntegration.findUnique({ where: { tenantId } });
  },

  createIntegration(data: Prisma.TenantWebhookIntegrationUncheckedCreateInput) {
    return prisma.tenantWebhookIntegration.create({ data });
  },

  updateIntegration(id: bigint, data: Prisma.TenantWebhookIntegrationUncheckedUpdateInput) {
    return prisma.tenantWebhookIntegration.update({ where: { id }, data });
  },

  // --- Endpoints ---

  findEndpointsByTenant(tenantId: bigint) {
    return prisma.webhookEndpoint.findMany({
      where: { tenantId },
      include: includeEventTypesAndLastDelivery,
      orderBy: { createdAt: "desc" },
    });
  },

  findEndpointForTenant(tenantId: bigint, endpointId: bigint) {
    return prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, tenantId },
      include: includeEventTypesAndLastDelivery,
    });
  },

  countEndpointsByTenant(tenantId: bigint): Promise<number> {
    return prisma.webhookEndpoint.count({ where: { tenantId } });
  },

  async createEndpoint(
    data: Prisma.WebhookEndpointUncheckedCreateInput,
    eventTypes: WebhookEventType[],
  ) {
    return prisma.$transaction(async (tx) => {
      const endpoint = await tx.webhookEndpoint.create({ data });
      await tx.webhookEndpointEventType.createMany({
        data: eventTypes.map((eventType) => ({ webhookEndpointId: endpoint.id, eventType })),
      });
      return tx.webhookEndpoint.findUniqueOrThrow({
        where: { id: endpoint.id },
        include: includeEventTypesAndLastDelivery,
      });
    });
  },

  async updateEndpoint(
    endpointId: bigint,
    data: Prisma.WebhookEndpointUncheckedUpdateInput,
    eventTypes?: WebhookEventType[],
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.webhookEndpoint.update({ where: { id: endpointId }, data });
      if (eventTypes) {
        await tx.webhookEndpointEventType.deleteMany({ where: { webhookEndpointId: endpointId } });
        await tx.webhookEndpointEventType.createMany({
          data: eventTypes.map((eventType) => ({ webhookEndpointId: endpointId, eventType })),
        });
      }
      return tx.webhookEndpoint.findUniqueOrThrow({
        where: { id: endpointId },
        include: includeEventTypesAndLastDelivery,
      });
    });
  },

  deleteEndpoint(endpointId: bigint): Promise<void> {
    return prisma.webhookEndpoint.delete({ where: { id: endpointId } }).then(() => undefined);
  },

  // Active endpoints subscribed to a given event, with the integration's
  // secret available for signing — used by enqueueEvent's delivery pass.
  findEndpointsSubscribedTo(tenantId: bigint, eventType: WebhookEventType) {
    return prisma.webhookEndpoint.findMany({
      where: { tenantId, isActive: true, eventTypes: { some: { eventType } } },
    });
  },

  // --- Deliveries ---

  createDelivery(data: Prisma.WebhookDeliveryUncheckedCreateInput) {
    return prisma.webhookDelivery.create({ data });
  },

  updateDelivery(id: bigint, data: Prisma.WebhookDeliveryUncheckedUpdateInput) {
    return prisma.webhookDelivery.update({ where: { id }, data });
  },

  findDeliveriesByEndpoint(endpointId: bigint, filter: { skip: number; take: number }) {
    return prisma.webhookDelivery.findMany({
      where: { webhookEndpointId: endpointId },
      orderBy: { createdAt: "desc" },
      skip: filter.skip,
      take: filter.take,
    });
  },

  countDeliveriesByEndpoint(endpointId: bigint): Promise<number> {
    return prisma.webhookDelivery.count({ where: { webhookEndpointId: endpointId } });
  },

  // Every delivery due for a retry attempt — used by the super-admin
  // drain endpoint (Docs/webhooks.md §5). Includes the endpoint + its
  // integration so the retry pass has everything it needs to re-sign and
  // re-POST without a second round trip.
  findPendingDeliveriesDueForRetry(now: Date, maxAttempts: number) {
    return prisma.webhookDelivery.findMany({
      where: {
        status: { in: ["PENDING", "FAILED"] },
        attemptCount: { lt: maxAttempts },
        nextRetryAt: { lte: now },
      },
      include: { webhookEndpoint: true },
      take: 100,
    });
  },
};
