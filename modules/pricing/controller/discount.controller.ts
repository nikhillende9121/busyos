import type { NextRequest } from "next/server";
import { createDiscountSchema, listDiscountsQuerySchema, exportDiscountsQuerySchema } from "../schema/discount.schema";
import { discountService } from "../service/discount.service";
import { successResponse, csvResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { toCsv } from "@/shared/utils/csv";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type DiscountParams = { id: string };

export const discountController = {
  async list(request: NextRequest, auth: AuthContext) {
    try {
      const query = listDiscountsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const discounts = await discountService.list({
        tenantId: auth.tenantId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        page: query.page,
        pageSize: query.pageSize,
      });
      return successResponse(discounts, "Discounts retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  // Every row matching the same filters as list(), as a CSV file — see
  // Docs/API_STANDARDS.md -> List Export.
  async exportList(request: NextRequest, auth: AuthContext) {
    try {
      const query = exportDiscountsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const discounts = await discountService.exportList({
        tenantId: auth.tenantId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      });
      const csv = toCsv(discounts, [
        { key: "id", header: "Discount #" },
        { key: "name", header: "Name" },
        { key: "type", header: "Type" },
        { key: "value", header: "Value" },
        { key: "scope", header: "Scope" },
        { key: "isActive", header: "Active" },
        { key: "startDate", header: "Start Date" },
        { key: "endDate", header: "End Date" },
      ]);
      return csvResponse(csv, `discounts-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: DiscountParams) {
    try {
      const id = idString.parse(params.id);
      const discount = await discountService.getById(auth.tenantId, BigInt(id));
      return successResponse(discount, "Discount retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createDiscountSchema.parse(body);
      const discount = await discountService.create({
        tenantId: auth.tenantId,
        name: input.name,
        type: input.type,
        value: input.value,
        scope: input.scope,
        warehouseId: input.warehouseId ? BigInt(input.warehouseId) : undefined,
        customerGroupId: input.customerGroupId ? BigInt(input.customerGroupId) : undefined,
        customerId: input.customerId ? BigInt(input.customerId) : undefined,
        productIds: input.productIds?.map((id) => BigInt(id)),
        categoryIds: input.categoryIds?.map((id) => BigInt(id)),
        minPurchaseAmount: input.minPurchaseAmount,
        maxDiscountAmount: input.maxDiscountAmount,
        startDate: input.startDate,
        endDate: input.endDate,
        stackable: input.stackable,
        priority: input.priority,
      });
      return successResponse(discount, "Discount created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
