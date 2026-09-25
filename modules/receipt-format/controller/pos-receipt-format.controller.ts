import type { NextRequest } from "next/server";
import { receiptFormatService } from "../service/receipt-format.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type PosParams = { posId: string };

// What the Android app actually calls — GET /pos/{posId}/receipt-format(/version).
// "posId" is this schema's Terminal.id (see prisma/schema.prisma's Terminal
// model comment) when it's numeric, but isn't required to be — Terminal.id is
// a BigInt column, so posId only participates in the terminal-level
// assignment check when it actually looks numeric; any other value (or a
// non-numeric device identifier some caller wants to send) just skips that
// check and resolves via store/tenant/default instead, same as before this
// endpoint stopped requiring a real Terminal row at all. See
// Docs/pos_receipt_format_guide.md.
export const posReceiptFormatController = {
  async resolve(_request: NextRequest, auth: AuthContext, params: PosParams) {
    try {
      const posId = toBigIntOrNull(params.posId);
      const resolved = await receiptFormatService.resolveForTerminal(posId, auth.tenantId, auth.warehouseId);
      return successResponse(resolved, "Receipt format retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async resolveVersion(_request: NextRequest, auth: AuthContext, params: PosParams) {
    try {
      const posId = toBigIntOrNull(params.posId);
      const resolved = await receiptFormatService.resolveVersionForTerminal(posId, auth.tenantId, auth.warehouseId);
      return successResponse(resolved, "Receipt format version retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};

function toBigIntOrNull(posId: string): bigint | null {
  return /^\d+$/.test(posId) ? BigInt(posId) : null;
}
