import { superAdminReceiptFormatController } from "@/modules/receipt-format/controller/receipt-format.controller";
import { withSuperAdminAuth } from "@/shared/middleware/with-super-admin-auth";

type Params = { id: string };

export const POST = withSuperAdminAuth<Params>(superAdminReceiptFormatController.assign);
