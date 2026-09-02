import type { NextRequest } from "next/server";
import {
  createWebhookEndpointSchema,
  updateWebhookEndpointSchema,
  updateIntegrationSchema,
  listDeliveriesQuerySchema,
} from "../schema/webhook.schema";
import { webhookService } from "../service/webhook.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type EndpointParams = { id: string };

// Receive request -> parse -> call service -> return response. No Prisma,
// no business rules here (see MODULES.md -> controller/).
export const webhookController = {
  async getIntegration(_request: NextRequest, auth: AuthContext) {
    try {
      const integration = await webhookService.getIntegration(auth.tenantId);
      return successResponse(integration, "Webhook integration retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async createIntegration(_request: NextRequest, auth: AuthContext) {
    try {
      const integration = await webhookService.createIntegration(auth.tenantId);
      return successResponse(integration, "Webhook integration created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async regenerateSecret(_request: NextRequest, auth: AuthContext) {
    try {
      const integration = await webhookService.regenerateSecret(auth.tenantId);
      return successResponse(integration, "Webhook secret regenerated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async updateIntegration(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = updateIntegrationSchema.parse(body);
      const integration = await webhookService.updateIntegration({
        tenantId: auth.tenantId,
        defaultOnlineWarehouseId:
          input.defaultOnlineWarehouseId === undefined
            ? undefined
            : input.defaultOnlineWarehouseId
              ? BigInt(input.defaultOnlineWarehouseId)
              : null,
        isEnabled: input.isEnabled,
      });
      return successResponse(integration, "Webhook integration updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async list(_request: NextRequest, auth: AuthContext) {
    try {
      const endpoints = await webhookService.listEndpoints(auth.tenantId);
      return successResponse(endpoints, "Webhook endpoints retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createWebhookEndpointSchema.parse(body);
      const endpoint = await webhookService.createEndpoint({
        tenantId: auth.tenantId,
        url: input.url,
        eventTypes: input.eventTypes,
      });
      return successResponse(endpoint, "Webhook endpoint created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async update(request: NextRequest, auth: AuthContext, params: EndpointParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = updateWebhookEndpointSchema.parse(body);
      const endpoint = await webhookService.updateEndpoint({
        tenantId: auth.tenantId,
        endpointId: BigInt(id),
        url: input.url,
        eventTypes: input.eventTypes,
        isActive: input.isActive,
      });
      return successResponse(endpoint, "Webhook endpoint updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async remove(_request: NextRequest, auth: AuthContext, params: EndpointParams) {
    try {
      const id = idString.parse(params.id);
      await webhookService.deleteEndpoint({ tenantId: auth.tenantId, endpointId: BigInt(id) });
      return successResponse(null, "Webhook endpoint deleted");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async sendTest(_request: NextRequest, auth: AuthContext, params: EndpointParams) {
    try {
      const id = idString.parse(params.id);
      const delivery = await webhookService.sendTestEvent({ tenantId: auth.tenantId, endpointId: BigInt(id) });
      return successResponse(delivery, "Test event sent");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async listDeliveries(request: NextRequest, auth: AuthContext, params: EndpointParams) {
    try {
      const id = idString.parse(params.id);
      const query = listDeliveriesQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const deliveries = await webhookService.listDeliveries({
        tenantId: auth.tenantId,
        endpointId: BigInt(id),
        page: query.page,
        pageSize: query.pageSize,
      });
      return successResponse(deliveries, "Webhook deliveries retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async processPending() {
    try {
      const result = await webhookService.processPendingDeliveries();
      return successResponse(result, "Pending deliveries processed");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
