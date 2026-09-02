import { randomBytes, createHmac } from "node:crypto";
import type { WebhookEndpoint, WebhookEventType } from "@prisma/client";
import { webhookRepository } from "../repository/webhook.repository";
import { AppError } from "@/shared/errors/app-error";
import { getActivePlanLimits } from "@/shared/utils/plan-limits";
import { encrypt, decrypt } from "@/shared/security/encryption";
import { assertSafeWebhookUrl } from "@/shared/validation/webhook-url";
import { buildPagination, type Paginated } from "@/shared/utils/pagination";
import type {
  CreateWebhookEndpointDto,
  UpdateWebhookEndpointDto,
  DeleteWebhookEndpointDto,
  SendTestEventDto,
  ListDeliveriesDto,
  UpdateIntegrationDto,
} from "../dto/webhook.dto";
import type { WebhookIntegrationView, WebhookEndpointView, WebhookDeliveryView } from "../types/webhook.types";

// Exponential backoff in minutes for attempts 1-4; the 5th failure is
// terminal (no further nextRetryAt) — see Docs/webhooks.md §5.
const RETRY_BACKOFF_MINUTES = [1, 5, 30, 120];
const MAX_DELIVERY_ATTEMPTS = 5;
const DELIVERY_TIMEOUT_MS = 10_000;

export const webhookService = {
  // --- Integration ---

  async getIntegration(tenantId: bigint): Promise<WebhookIntegrationView | null> {
    const integration = await webhookRepository.findIntegrationByTenant(tenantId);
    return integration ? toIntegrationView(integration) : null;
  },

  async createIntegration(tenantId: bigint): Promise<WebhookIntegrationView> {
    const existing = await webhookRepository.findIntegrationByTenant(tenantId);
    if (existing) {
      throw new AppError("CONFLICT", "This tenant already has webhook integration credentials");
    }
    const apiKey = randomBytes(24).toString("hex");
    const apiSecret = randomBytes(32).toString("hex");
    const created = await webhookRepository.createIntegration({
      tenantId,
      apiKey,
      apiSecretEncrypted: encrypt(apiSecret),
    });
    return toIntegrationView(created, apiSecret);
  },

  async regenerateSecret(tenantId: bigint): Promise<WebhookIntegrationView> {
    const existing = await webhookRepository.findIntegrationByTenant(tenantId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "No webhook integration exists for this tenant yet");
    }
    const apiSecret = randomBytes(32).toString("hex");
    const updated = await webhookRepository.updateIntegration(existing.id, {
      apiSecretEncrypted: encrypt(apiSecret),
    });
    return toIntegrationView(updated, apiSecret);
  },

  async updateIntegration(dto: UpdateIntegrationDto): Promise<WebhookIntegrationView> {
    const existing = await webhookRepository.findIntegrationByTenant(dto.tenantId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "No webhook integration exists for this tenant yet");
    }
    const updated = await webhookRepository.updateIntegration(existing.id, {
      ...(dto.defaultOnlineWarehouseId !== undefined ? { defaultOnlineWarehouseId: dto.defaultOnlineWarehouseId } : {}),
      ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
    });
    return toIntegrationView(updated);
  },

  // --- Endpoints ---

  async listEndpoints(tenantId: bigint): Promise<WebhookEndpointView[]> {
    const endpoints = await webhookRepository.findEndpointsByTenant(tenantId);
    return endpoints.map((endpoint) => toEndpointView(endpoint));
  },

  // Blocked once a tenant's plan-limit is reached — same shape as
  // roleService.create()'s maxRoles enforcement. A tenant must have
  // created integration credentials first (getIntegration/createIntegration
  // above) before it can register an endpoint.
  async createEndpoint(dto: CreateWebhookEndpointDto): Promise<WebhookEndpointView> {
    const integration = await webhookRepository.findIntegrationByTenant(dto.tenantId);
    if (!integration) {
      throw new AppError("VALIDATION_ERROR", "Create webhook integration credentials before adding an endpoint");
    }

    const { maxWebhooks } = await getActivePlanLimits(dto.tenantId);
    if (maxWebhooks !== null) {
      const currentCount = await webhookRepository.countEndpointsByTenant(dto.tenantId);
      if (currentCount >= maxWebhooks) {
        throw new AppError(
          "PLAN_LIMIT_REACHED",
          `Your plan allows up to ${maxWebhooks} webhook${maxWebhooks === 1 ? "" : "s"} — upgrade to add more`,
        );
      }
    }

    await assertSafeWebhookUrl(dto.url);

    const signingSecret = randomBytes(32).toString("hex");
    const created = await webhookRepository.createEndpoint(
      {
        tenantId: dto.tenantId,
        integrationId: integration.id,
        url: dto.url,
        signingSecret: encrypt(signingSecret),
      },
      dto.eventTypes as WebhookEventType[],
    );
    return toEndpointView(created, signingSecret);
  },

  async updateEndpoint(dto: UpdateWebhookEndpointDto): Promise<WebhookEndpointView> {
    const existing = await webhookRepository.findEndpointForTenant(dto.tenantId, dto.endpointId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Webhook endpoint not found");
    }
    if (dto.url) {
      await assertSafeWebhookUrl(dto.url);
    }
    const updated = await webhookRepository.updateEndpoint(
      dto.endpointId,
      {
        ...(dto.url !== undefined ? { url: dto.url } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      dto.eventTypes as WebhookEventType[] | undefined,
    );
    return toEndpointView(updated);
  },

  async deleteEndpoint(dto: DeleteWebhookEndpointDto): Promise<void> {
    const existing = await webhookRepository.findEndpointForTenant(dto.tenantId, dto.endpointId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Webhook endpoint not found");
    }
    await webhookRepository.deleteEndpoint(dto.endpointId);
  },

  async listDeliveries(dto: ListDeliveriesDto): Promise<Paginated<WebhookDeliveryView>> {
    const existing = await webhookRepository.findEndpointForTenant(dto.tenantId, dto.endpointId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Webhook endpoint not found");
    }
    const skip = (dto.page - 1) * dto.pageSize;
    const [deliveries, total] = await Promise.all([
      webhookRepository.findDeliveriesByEndpoint(dto.endpointId, { skip, take: dto.pageSize }),
      webhookRepository.countDeliveriesByEndpoint(dto.endpointId),
    ]);
    return {
      items: deliveries.map(toDeliveryView),
      pagination: buildPagination(dto.page, dto.pageSize, total),
    };
  },

  async sendTestEvent(dto: SendTestEventDto): Promise<WebhookDeliveryView> {
    const endpoint = await webhookRepository.findEndpointForTenant(dto.tenantId, dto.endpointId);
    if (!endpoint) {
      throw new AppError("RESOURCE_NOT_FOUND", "Webhook endpoint not found");
    }
    const payload = {
      test: true,
      eventType: "PRODUCT_UPDATED",
      sentAt: new Date().toISOString(),
      data: { id: "test", sku: "TEST-SKU", name: "Test Product" },
    };
    const delivery = await webhookRepository.createDelivery({
      webhookEndpointId: endpoint.id,
      eventType: "PRODUCT_UPDATED",
      payload,
    });
    const result = await attemptDelivery(endpoint, delivery.id, payload);
    return toDeliveryView(result);
  },

  // Called by product/pricing services after their own write already
  // succeeded — never awaited by the caller (fire-and-forget; see the
  // call sites in modules/product/service/product.service.ts etc.), and
  // never throws, so a webhook delivery problem can never fail the
  // business operation that triggered it.
  async enqueueEvent(tenantId: bigint, eventType: WebhookEventType, payload: unknown): Promise<void> {
    try {
      const endpoints = await webhookRepository.findEndpointsSubscribedTo(tenantId, eventType);
      await Promise.all(
        endpoints.map(async (endpoint) => {
          const delivery = await webhookRepository.createDelivery({
            webhookEndpointId: endpoint.id,
            eventType,
            payload: payload as never,
          });
          await attemptDelivery(endpoint, delivery.id, payload);
        }),
      );
    } catch {
      // Deliberately swallowed — see the function comment above.
    }
  },

  // Drains every delivery due for a retry — invoked by
  // POST /api/v1/super-admin/webhooks/process-pending, meant to be called
  // by an external scheduler (no in-process cron in this codebase — see
  // Docs/webhooks.md §5).
  async processPendingDeliveries(): Promise<{ processed: number }> {
    const due = await webhookRepository.findPendingDeliveriesDueForRetry(new Date(), MAX_DELIVERY_ATTEMPTS);
    for (const delivery of due) {
      await attemptDelivery(delivery.webhookEndpoint, delivery.id, delivery.payload);
    }
    return { processed: due.length };
  },
};

// Re-validates the URL at delivery time too (DNS rebinding — see
// shared/validation/webhook-url.ts), signs the payload with this
// endpoint's own secret, POSTs it, and records the outcome. Never throws
// — a delivery failure is recorded as data (WebhookDelivery.status), not
// propagated as an exception.
async function attemptDelivery(
  endpoint: WebhookEndpoint,
  deliveryId: bigint,
  payload: unknown,
): Promise<Awaited<ReturnType<typeof webhookRepository.updateDelivery>>> {
  const now = new Date();
  const body = JSON.stringify(payload);

  try {
    await assertSafeWebhookUrl(endpoint.url);
    const signature = createHmac("sha256", decrypt(endpoint.signingSecret)).update(body).digest("hex");

    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Signature": `sha256=${signature}` },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });

    if (response.ok) {
      return webhookRepository.updateDelivery(deliveryId, {
        status: "SUCCESS",
        httpStatusCode: response.status,
        attemptCount: { increment: 1 },
        lastAttemptedAt: now,
        nextRetryAt: null,
      });
    }
    return recordFailedAttempt(deliveryId, now, response.status);
  } catch {
    return recordFailedAttempt(deliveryId, now, null);
  }
}

async function recordFailedAttempt(deliveryId: bigint, now: Date, httpStatusCode: number | null) {
  const current = await webhookRepository.updateDelivery(deliveryId, {
    status: "FAILED",
    httpStatusCode,
    attemptCount: { increment: 1 },
    lastAttemptedAt: now,
  });
  const nextAttemptIndex = current.attemptCount - 1; // 0-based into RETRY_BACKOFF_MINUTES
  const backoffMinutes = RETRY_BACKOFF_MINUTES[nextAttemptIndex];
  const nextRetryAt = backoffMinutes !== undefined ? new Date(now.getTime() + backoffMinutes * 60_000) : null;
  return webhookRepository.updateDelivery(deliveryId, { nextRetryAt });
}

function toIntegrationView(
  integration: {
    id: bigint;
    apiKey: string;
    defaultOnlineWarehouseId: bigint | null;
    isEnabled: boolean;
    createdAt: Date;
  },
  apiSecret?: string,
): WebhookIntegrationView {
  return {
    id: integration.id.toString(),
    apiKey: integration.apiKey,
    ...(apiSecret ? { apiSecret } : {}),
    defaultOnlineWarehouseId: integration.defaultOnlineWarehouseId?.toString() ?? null,
    isEnabled: integration.isEnabled,
    createdAt: integration.createdAt.toISOString(),
  };
}

function toEndpointView(
  endpoint: WebhookEndpoint & {
    eventTypes: { eventType: WebhookEventType }[];
    deliveries?: { status: string; createdAt: Date }[];
  },
  signingSecret?: string,
): WebhookEndpointView {
  const lastDelivery = endpoint.deliveries?.[0];
  return {
    id: endpoint.id.toString(),
    url: endpoint.url,
    isActive: endpoint.isActive,
    eventTypes: endpoint.eventTypes.map((row) => row.eventType),
    ...(signingSecret ? { signingSecret } : {}),
    lastDelivery: lastDelivery ? { status: lastDelivery.status, createdAt: lastDelivery.createdAt.toISOString() } : null,
    createdAt: endpoint.createdAt.toISOString(),
  };
}

function toDeliveryView(delivery: {
  id: bigint;
  eventType: string;
  status: string;
  httpStatusCode: number | null;
  attemptCount: number;
  createdAt: Date;
  lastAttemptedAt: Date | null;
}): WebhookDeliveryView {
  return {
    id: delivery.id.toString(),
    eventType: delivery.eventType,
    status: delivery.status,
    httpStatusCode: delivery.httpStatusCode,
    attemptCount: delivery.attemptCount,
    createdAt: delivery.createdAt.toISOString(),
    lastAttemptedAt: delivery.lastAttemptedAt?.toISOString() ?? null,
  };
}
