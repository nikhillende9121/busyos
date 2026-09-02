import type { NextRequest } from "next/server";
import { createInboundOrderSchema } from "../schema/webhook.schema";
import { orderIngestionService, hashRequestBody } from "../service/order-ingestion.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import type { WebhookAuthContext } from "@/shared/middleware/with-webhook-auth";

export const orderIngestionController = {
  async create(request: NextRequest, auth: WebhookAuthContext, body: unknown) {
    try {
      const input = createInboundOrderSchema.parse(body);
      const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
      // Hashed from the exact body the schema validated (JSON.stringify of
      // the parsed+validated input, not the raw bytes) — a caller that
      // reformats whitespace/key order on retry still hits the same hash.
      const requestHash = hashRequestBody(JSON.stringify(input));

      const sale = await orderIngestionService.createOrder({
        tenantId: auth.tenantId,
        integrationId: auth.integrationId,
        defaultWarehouseId: auth.defaultWarehouseId,
        idempotencyKey,
        requestHash,
        externalOrderReference: input.externalOrderReference,
        customerId: input.customerId ? BigInt(input.customerId) : undefined,
        items: input.items,
        couponCode: input.couponCode,
      });
      return successResponse(sale, "Order received", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
