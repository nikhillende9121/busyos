import type { NextRequest } from "next/server";
import { receiptFormatService } from "../service/receipt-format.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type PosParams = { posId: string };

// What the Android app actually calls — GET /pos/{posId}/receipt-format(/version).
// "posId" is this schema's Terminal.id (see prisma/schema.prisma's Terminal
// model comment); Docs/pos_receipt_format_guide.md's own vocabulary.
export const posReceiptFormatController = {
  async resolve(_request: NextRequest, auth: AuthContext, params: PosParams) {
    try {
      const posId = idString.parse(params.posId);
      const resolved = await receiptFormatService.resolveForTerminal(BigInt(posId), auth.tenantId, auth.warehouseId);
      return successResponse(resolved, "Receipt format retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async resolveVersion(_request: NextRequest, auth: AuthContext, params: PosParams) {
    try {
      const posId = idString.parse(params.posId);
      const resolved = await receiptFormatService.resolveVersionForTerminal(
        BigInt(posId),
        auth.tenantId,
        auth.warehouseId,
      );
      return successResponse(resolved, "Receipt format version retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
