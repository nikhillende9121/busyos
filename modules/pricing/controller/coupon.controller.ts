import type { NextRequest } from "next/server";
import { createCouponSchema, listCouponsQuerySchema, exportCouponsQuerySchema } from "../schema/coupon.schema";
import { couponService } from "../service/coupon.service";
import { successResponse, csvResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { toCsv } from "@/shared/utils/csv";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type CouponParams = { id: string };

export const couponController = {
  async list(request: NextRequest, auth: AuthContext) {
    try {
      const query = listCouponsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const coupons = await couponService.list({
        tenantId: auth.tenantId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        page: query.page,
        pageSize: query.pageSize,
      });
      return successResponse(coupons, "Coupons retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  // Every row matching the same filters as list(), as a CSV file — see
  // Docs/API_STANDARDS.md -> List Export.
  async exportList(request: NextRequest, auth: AuthContext) {
    try {
      const query = exportCouponsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const coupons = await couponService.exportList({
        tenantId: auth.tenantId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      });
      const csv = toCsv(coupons, [
        { key: "id", header: "Coupon #" },
        { key: "code", header: "Code" },
        { key: "type", header: "Type" },
        { key: "value", header: "Value" },
        { key: "scope", header: "Scope" },
        { key: "isActive", header: "Active" },
        { key: "startDate", header: "Start Date" },
        { key: "endDate", header: "End Date" },
      ]);
      return csvResponse(csv, `coupons-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, auth: AuthContext, params: CouponParams) {
    try {
      const id = idString.parse(params.id);
      const coupon = await couponService.getById(auth.tenantId, BigInt(id));
      return successResponse(coupon, "Coupon retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = createCouponSchema.parse(body);
      const coupon = await couponService.create({
        tenantId: auth.tenantId,
        code: input.code,
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
        usageLimitTotal: input.usageLimitTotal,
        usageLimitPerCustomer: input.usageLimitPerCustomer,
        startDate: input.startDate,
        endDate: input.endDate,
        stackable: input.stackable,
      });
      return successResponse(coupon, "Coupon created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
