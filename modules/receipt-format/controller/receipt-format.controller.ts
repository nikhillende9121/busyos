import type { NextRequest } from "next/server";
import {
  createReceiptFormatSchema,
  updateReceiptFormatSchema,
  cloneReceiptFormatSchema,
  assignReceiptFormatSchema,
} from "../schema/receipt-format.schema";
import { receiptFormatService } from "../service/receipt-format.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { SuperAdminAuthContext } from "@/shared/middleware/with-super-admin-auth";

type FormatParams = { id: string };

// Super Admin-only authoring surface — list/create/update/delete/assign/
// clone. The Android app never hits any of these; it only calls
// pos-receipt-format.controller.ts's resolve/version endpoints.
export const superAdminReceiptFormatController = {
  async list() {
    try {
      const formats = await receiptFormatService.list();
      return successResponse(formats, "Receipt formats retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getById(_request: NextRequest, _auth: SuperAdminAuthContext, params: FormatParams) {
    try {
      const id = idString.parse(params.id);
      const format = await receiptFormatService.getById(BigInt(id));
      return successResponse(format, "Receipt format retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async create(request: NextRequest, auth: SuperAdminAuthContext) {
    try {
      const body = await request.json();
      const input = createReceiptFormatSchema.parse(body);
      const format = await receiptFormatService.create({ ...input, createdBy: auth.superAdminId });
      return successResponse(format, "Receipt format created", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async update(request: NextRequest, _auth: SuperAdminAuthContext, params: FormatParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = updateReceiptFormatSchema.parse(body);
      const format = await receiptFormatService.update({ formatId: BigInt(id), ...input });
      return successResponse(format, "Receipt format updated");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async remove(_request: NextRequest, _auth: SuperAdminAuthContext, params: FormatParams) {
    try {
      const id = idString.parse(params.id);
      await receiptFormatService.remove(BigInt(id));
      return successResponse(null, "Receipt format deleted");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async clone(request: NextRequest, auth: SuperAdminAuthContext, params: FormatParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = cloneReceiptFormatSchema.parse(body);
      const format = await receiptFormatService.clone({
        sourceId: BigInt(id),
        name: input.name,
        createdBy: auth.superAdminId,
      });
      return successResponse(format, "Receipt format cloned", 201);
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async assign(request: NextRequest, _auth: SuperAdminAuthContext, params: FormatParams) {
    try {
      const id = idString.parse(params.id);
      const body = await request.json();
      const input = assignReceiptFormatSchema.parse(body);
      const format = await receiptFormatService.assign({
        formatId: BigInt(id),
        tenantId: input.tenantId ? BigInt(input.tenantId) : undefined,
        warehouseId: input.warehouseId ? BigInt(input.warehouseId) : undefined,
        terminalId: input.terminalId ? BigInt(input.terminalId) : undefined,
      });
      return successResponse(format, "Receipt format assigned");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
