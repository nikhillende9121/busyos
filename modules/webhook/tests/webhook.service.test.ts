import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../repository/webhook.repository", () => ({
  webhookRepository: {
    findIntegrationByTenant: vi.fn(),
    createIntegration: vi.fn(),
    updateIntegration: vi.fn(),
    findEndpointsByTenant: vi.fn(),
    findEndpointForTenant: vi.fn(),
    countEndpointsByTenant: vi.fn(),
    createEndpoint: vi.fn(),
    updateEndpoint: vi.fn(),
    deleteEndpoint: vi.fn(),
    findEndpointsSubscribedTo: vi.fn(),
    createDelivery: vi.fn(),
    updateDelivery: vi.fn(),
    findDeliveriesByEndpoint: vi.fn(),
    countDeliveriesByEndpoint: vi.fn(),
    findPendingDeliveriesDueForRetry: vi.fn(),
  },
}));

vi.mock("@/shared/utils/plan-limits", () => ({
  getActivePlanLimits: vi.fn(),
}));

// Passthrough — this test suite verifies webhookService's own logic, not
// AES-GCM correctness (see shared/security/encryption.ts's own concerns).
vi.mock("@/shared/security/encryption", () => ({
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (value: string) => value.replace(/^enc:/, ""),
}));

vi.mock("@/shared/validation/webhook-url", () => ({
  assertSafeWebhookUrl: vi.fn(),
}));

import { webhookRepository } from "../repository/webhook.repository";
import { getActivePlanLimits } from "@/shared/utils/plan-limits";
import { assertSafeWebhookUrl } from "@/shared/validation/webhook-url";
import { webhookService } from "../service/webhook.service";

function endpointRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1n,
    tenantId: 1n,
    integrationId: 1n,
    url: "https://example.com/hook",
    signingSecret: "enc:secret",
    isActive: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    eventTypes: [{ eventType: "PRODUCT_UPDATED" }],
    deliveries: [],
    ...overrides,
  };
}

describe("webhookService.createEndpoint", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(webhookRepository.findIntegrationByTenant).mockResolvedValue({ id: 1n } as never);
    vi.mocked(getActivePlanLimits).mockResolvedValue({
      maxWarehouses: null,
      maxUsers: null,
      maxRoles: null,
      maxWebhooks: null,
    });
    vi.mocked(webhookRepository.createEndpoint).mockResolvedValue(endpointRow() as never);
  });

  it("requires webhook integration credentials to exist first", async () => {
    vi.mocked(webhookRepository.findIntegrationByTenant).mockResolvedValue(null);

    await expect(
      webhookService.createEndpoint({ tenantId: 1n, url: "https://example.com/hook", eventTypes: ["PRODUCT_UPDATED"] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(webhookRepository.createEndpoint).not.toHaveBeenCalled();
  });

  it("blocks creation once the plan's webhook limit is reached", async () => {
    vi.mocked(getActivePlanLimits).mockResolvedValue({
      maxWarehouses: null,
      maxUsers: null,
      maxRoles: null,
      maxWebhooks: 2,
    });
    vi.mocked(webhookRepository.countEndpointsByTenant).mockResolvedValue(2);

    await expect(
      webhookService.createEndpoint({ tenantId: 1n, url: "https://example.com/hook", eventTypes: ["PRODUCT_UPDATED"] }),
    ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
    expect(webhookRepository.createEndpoint).not.toHaveBeenCalled();
  });

  it("allows creation when under the plan's webhook limit and validates the URL", async () => {
    vi.mocked(getActivePlanLimits).mockResolvedValue({
      maxWarehouses: null,
      maxUsers: null,
      maxRoles: null,
      maxWebhooks: 2,
    });
    vi.mocked(webhookRepository.countEndpointsByTenant).mockResolvedValue(1);

    const endpoint = await webhookService.createEndpoint({
      tenantId: 1n,
      url: "https://example.com/hook",
      eventTypes: ["PRODUCT_UPDATED"],
    });

    expect(assertSafeWebhookUrl).toHaveBeenCalledWith("https://example.com/hook");
    expect(webhookRepository.createEndpoint).toHaveBeenCalled();
    // signingSecret is present on the create response (shown once), and
    // encrypted before being sent to the repository.
    expect(endpoint.signingSecret).toBeDefined();
  });

  it("propagates a rejected SSRF-unsafe URL without creating anything", async () => {
    vi.mocked(assertSafeWebhookUrl).mockRejectedValue(new Error("unsafe"));

    await expect(
      webhookService.createEndpoint({ tenantId: 1n, url: "http://169.254.169.254/", eventTypes: ["PRODUCT_UPDATED"] }),
    ).rejects.toThrow();
    expect(webhookRepository.createEndpoint).not.toHaveBeenCalled();
  });
});

describe("webhookService.enqueueEvent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
  });

  it("only delivers to endpoints subscribed to the given event type", async () => {
    vi.mocked(webhookRepository.findEndpointsSubscribedTo).mockResolvedValue([endpointRow()] as never);
    vi.mocked(webhookRepository.createDelivery).mockResolvedValue({ id: 10n } as never);
    vi.mocked(webhookRepository.updateDelivery).mockResolvedValue({
      id: 10n,
      attemptCount: 1,
    } as never);

    await webhookService.enqueueEvent(1n, "PRODUCT_UPDATED", { id: "1" });

    expect(webhookRepository.findEndpointsSubscribedTo).toHaveBeenCalledWith(1n, "PRODUCT_UPDATED");
    expect(webhookRepository.createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ webhookEndpointId: 1n, eventType: "PRODUCT_UPDATED" }),
    );
  });

  it("never throws even when the repository lookup fails", async () => {
    vi.mocked(webhookRepository.findEndpointsSubscribedTo).mockRejectedValue(new Error("db down"));

    await expect(webhookService.enqueueEvent(1n, "PRODUCT_UPDATED", { id: "1" })).resolves.toBeUndefined();
  });

  it("records a FAILED delivery with a nextRetryAt when the POST fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    vi.mocked(webhookRepository.findEndpointsSubscribedTo).mockResolvedValue([endpointRow()] as never);
    vi.mocked(webhookRepository.createDelivery).mockResolvedValue({ id: 10n } as never);
    vi.mocked(webhookRepository.updateDelivery).mockResolvedValue({
      id: 10n,
      attemptCount: 1,
    } as never);

    await webhookService.enqueueEvent(1n, "PRODUCT_UPDATED", { id: "1" });

    expect(webhookRepository.updateDelivery).toHaveBeenCalledWith(
      10n,
      expect.objectContaining({ status: "FAILED", httpStatusCode: 500 }),
    );
    expect(webhookRepository.updateDelivery).toHaveBeenCalledWith(10n, expect.objectContaining({ nextRetryAt: expect.any(Date) }));
  });
});
