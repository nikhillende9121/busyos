import { posReceiptFormatController } from "@/modules/receipt-format/controller/pos-receipt-format.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { posId: string };

export const GET = withApiAuth<Params>(posReceiptFormatController.resolve, { permission: "SALE.VIEW" });
