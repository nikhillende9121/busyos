import type { NextRequest } from "next/server";
import {
  upsertCreditConfigSchema,
  recordOpeningBalanceSchema,
  recordCreditPaymentSchema,
  listCreditTransactionsQuerySchema,
  creditReportQuerySchema,
} from "../schema/credit.schema";
import { creditService } from "../service/credit.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type CustomerParams = { id: string };

export const creditController = {
  async getConfig(_request: NextRequest, auth: AuthContext, params: CustomerParams) {
    try {
      const customerId = idString.parse(params.id);
      const config = await creditService.getConfig(auth.tenantId, BigInt(customerId));
      return successResponse(config, "Credit config retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async updateConfig(request: NextRequest, auth: AuthContext, params: CustomerParams) {
    try {
      const customerId = idString.parse(params.id);
      const body = await request.json();
      const input = upsertCreditConfigSchema.parse(body);
      const config = await creditService.upsertConfig({
        tenantId: auth.tenantId,
        customerId: BigInt(customerId),
        creditLimit: input.creditLimit,
        settlementDay: input.settlementDay,
      });
      return successResponse(config, "Credit config updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getSummary(_request: NextRequest, auth: AuthContext, params: CustomerParams) {
    try {
      const customerId = idString.parse(params.id);
      const summary = await creditService.getSummary(auth.tenantId, BigInt(customerId));
      return successResponse(summary, "Credit summary retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async recordOpeningBalance(request: NextRequest, auth: AuthContext, params: CustomerParams) {
    try {
      const customerId = idString.parse(params.id);
      const body = await request.json();
      const input = recordOpeningBalanceSchema.parse(body);
      const transaction = await creditService.recordOpeningBalance({
        tenantId: auth.tenantId,
        customerId: BigInt(customerId),
        amount: input.amount,
        remarks: input.remarks,
        createdBy: auth.userId,
      });
      return successResponse(transaction, "Opening balance recorded", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async recordPayment(request: NextRequest, auth: AuthContext, params: CustomerParams) {
    try {
      const customerId = idString.parse(params.id);
      const body = await request.json();
      const input = recordCreditPaymentSchema.parse(body);
      const transaction = await creditService.recordPayment({
        tenantId: auth.tenantId,
        customerId: BigInt(customerId),
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        remarks: input.remarks,
        createdBy: auth.userId,
      });
      return successResponse(transaction, "Payment recorded", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async listTransactions(request: NextRequest, auth: AuthContext, params: CustomerParams) {
    try {
      const customerId = idString.parse(params.id);
      const query = listCreditTransactionsQuerySchema.parse(
        Object.fromEntries(request.nextUrl.searchParams),
      );
      const result = await creditService.listTransactions({
        tenantId: auth.tenantId,
        customerId: BigInt(customerId),
        page: query.page,
        pageSize: query.pageSize,
      });
      return successResponse(result, "Credit transactions retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getReport(request: NextRequest, auth: AuthContext) {
    try {
      const query = creditReportQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const result = await creditService.getReport({
        tenantId: auth.tenantId,
        page: query.page,
        pageSize: query.pageSize,
      });
      return successResponse(result, "Credit report retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
