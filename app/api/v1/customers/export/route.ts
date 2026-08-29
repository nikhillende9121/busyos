import { customerController } from "@/modules/customer/controller/customer.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// Same permission as the list route — exporting is still just viewing,
// in bulk.
export const GET = withApiAuth(customerController.exportList, {
  feature: "CUSTOMER",
  permission: "CUSTOMER.VIEW",
});
