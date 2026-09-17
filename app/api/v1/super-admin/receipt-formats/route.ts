import { superAdminReceiptFormatController } from "@/modules/receipt-format/controller/receipt-format.controller";
import { withSuperAdminAuth } from "@/shared/middleware/with-super-admin-auth";

export const GET = withSuperAdminAuth(superAdminReceiptFormatController.list);
export const POST = withSuperAdminAuth(superAdminReceiptFormatController.create);
