import { reportController } from "@/modules/report/controller/report.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(reportController.getGst, {
  feature: "GST_REPORT",
  permission: "REPORT.VIEW",
});
