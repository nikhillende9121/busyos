import { superAdminReceiptFormatController } from "@/modules/receipt-format/controller/receipt-format.controller";
import { withSuperAdminAuth } from "@/shared/middleware/with-super-admin-auth";

type Params = { id: string };

export const GET = withSuperAdminAuth<Params>(superAdminReceiptFormatController.getById);
export const PUT = withSuperAdminAuth<Params>(superAdminReceiptFormatController.update);
export const DELETE = withSuperAdminAuth<Params>(superAdminReceiptFormatController.remove);
