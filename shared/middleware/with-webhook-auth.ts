import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@/shared/errors/app-error";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { getActiveSubscription, isSubscriptionExpired } from "@/shared/utils/subscription";
import { decrypt } from "@/shared/security/encryption";
import { rbacLookup } from "./rbac-lookup";
import { webhookLookup } from "./webhook-lookup";

// The auth pipeline for POST /api/v1/integrations/orders — a tenant's own
// website calling INTO this platform, not a browser session. Shorter than
// with-api-auth.ts's pipeline (no user/role — the credential is
// tenant-scoped, not user-scoped) but the same shape: pipeline errors are
// handled here, handler errors are the caller's own responsibility (see
// with-api-auth.ts's identical split). See Docs/webhooks.md §4.
export type WebhookAuthContext = {
  tenantId: bigint;
  integrationId: bigint;
  defaultWarehouseId: bigint | null;
};

export type WebhookHandler = (request: NextRequest, auth: WebhookAuthContext, body: unknown) => Promise<Response>;

const WEBHOOK_FEATURE_CODE = "WEBHOOK";

export function withWebhookAuth(handler: WebhookHandler) {
  return async (request: NextRequest): Promise<Response> => {
    let auth: WebhookAuthContext;
    let body: unknown;
    try {
      const result = await runPipeline(request);
      auth = result.auth;
      body = result.body;
    } catch (error) {
      return handleRouteError(error);
    }
    return handler(request, auth, body);
  };
}

async function runPipeline(request: NextRequest): Promise<{ auth: WebhookAuthContext; body: unknown }> {
  // Raw bytes first — signature verification must run over exactly what
  // was sent, not a re-serialized JSON.parse/stringify round trip, which
  // is not guaranteed to reproduce the same bytes (key order, whitespace).
  const rawBody = await request.text();

  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    throw new AppError("UNAUTHENTICATED", "Missing X-Api-Key header");
  }
  const integration = await webhookLookup.findIntegrationByApiKey(apiKey);
  if (!integration) {
    throw new AppError("UNAUTHENTICATED", "Invalid API key");
  }

  const signatureHeader = request.headers.get("x-signature");
  if (!signatureHeader) {
    throw new AppError("UNAUTHENTICATED", "Missing X-Signature header");
  }
  const providedSignature = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;
  const expectedSignature = createHmac("sha256", decrypt(integration.apiSecretEncrypted))
    .update(rawBody)
    .digest("hex");
  if (!signaturesMatch(providedSignature, expectedSignature)) {
    throw new AppError("UNAUTHENTICATED", "Signature verification failed");
  }

  if (!integration.isEnabled) {
    throw new AppError("UNAUTHENTICATED", "This integration has been disabled");
  }

  const featureEnabled = await rbacLookup.isFeatureEnabledForTenant(integration.tenantId, WEBHOOK_FEATURE_CODE);
  if (!featureEnabled) {
    throw new AppError("FEATURE_NOT_ENABLED", `Feature "${WEBHOOK_FEATURE_CODE}" is not enabled for this tenant`);
  }

  if (isSubscriptionExpired(await getActiveSubscription(integration.tenantId))) {
    throw new AppError("SUBSCRIPTION_EXPIRED", "This tenant's account is not active");
  }

  let body: unknown;
  try {
    body = rawBody.length > 0 ? JSON.parse(rawBody) : {};
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body is not valid JSON");
  }

  return {
    auth: {
      tenantId: integration.tenantId,
      integrationId: integration.id,
      defaultWarehouseId: integration.defaultOnlineWarehouseId,
    },
    body,
  };
}

// timingSafeEqual throws on mismatched-length buffers rather than
// returning false — a signature of the wrong length is just as much a
// mismatch as one of the right length with different bytes.
function signaturesMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}
