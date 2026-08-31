import type { NextRequest } from "next/server";
import { gstReportQuerySchema } from "../schema/report.schema";
import { reportService } from "../service/report.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

const DAY_MS = 24 * 60 * 60 * 1000;

// Receive request -> parse -> call service -> return response. No Prisma,
// no business rules here (see MODULES.md -> controller/).
export const reportController = {
  async getGst(request: NextRequest, auth: AuthContext) {
    try {
      const query = gstReportQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      // dateTo arrives as a bare date (midnight UTC) — extend to the end of
      // that day so a transaction any time on the "to" date is still
      // included, matching the period boundary the GST report page itself
      // used to construct client-side before this endpoint existed.
      const periodEnd = new Date(query.dateTo.getTime() + DAY_MS - 1);
      const insights = await reportService.getGstReport({
        tenantId: auth.tenantId,
        periodStart: query.dateFrom,
        periodEnd,
      });
      return successResponse(insights, "GST report computed");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
