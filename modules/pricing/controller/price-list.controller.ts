import type { NextRequest } from "next/server";
import { createPriceListSchema, resolvePriceQuerySchema } from "../schema/price-list.schema";
import { priceListService } from "../service/price-list.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type PriceListParams = { id: string };

export const priceListController = {
  async list(_request: NextRequest, auth: AuthContext) {
    try {
      const priceLists = await priceListService.list(auth.tenantId);
      return successResponse(priceLists, "Price lists retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: PriceListParams) {
    try {
      const id = idString.parse(params.id);
      const priceList = await priceListService.getById(auth.tenantId, BigInt(id));
      return successResponse(priceList, "Price list retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createPriceListSchema.parse(body);
      const priceList = await priceListService.create({
        tenantId: auth.tenantId,
        name: input.name,
        warehouseId: input.warehouseId ? BigInt(input.warehouseId) : undefined,
        customerGroupId: input.customerGroupId ? BigInt(input.customerGroupId) : undefined,
        customerId: input.customerId ? BigInt(input.customerId) : undefined,
        currency: input.currency,
        isDefault: input.isDefault,
        items: input.items.map((item) => ({
          productId: BigInt(item.productId),
          price: item.price,
          minQuantity: item.minQuantity,
        })),
      });
      return successResponse(priceList, "Price list created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async resolve(request: NextRequest, auth: AuthContext) {
    try {
      const query = resolvePriceQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const resolved = await priceListService.resolvePrice({
        tenantId: auth.tenantId,
        productId: BigInt(query.productId),
        warehouseId: query.warehouseId ? BigInt(query.warehouseId) : undefined,
        customerGroupId: query.customerGroupId ? BigInt(query.customerGroupId) : undefined,
        customerId: query.customerId ? BigInt(query.customerId) : undefined,
        quantity: query.quantity,
      });
      return successResponse(resolved, "Price resolved");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
