import type { ExchangeDirection } from "@prisma/client";
import type { SaleReturnView } from "./sale-return.types";
import type { SaleView } from "./sale.types";

export type SaleExchangeView = {
  id: string;
  saleReturn: SaleReturnView;
  newSale: SaleView;
  differenceAmount: string;
  differenceDirection: ExchangeDirection;
  createdAt: string;
};

// The read-only preview of what POST /sale-exchanges would compute — same
// settlement numbers, without persisting the return leg, the replacement
// sale, or a Payment.
export type SaleExchangeQuoteView = {
  returnItems: { saleItemId: string; productId: string; quantity: string; refundAmount: string }[];
  newItems: { productId: string; quantity: string; amount: string }[];
  chargesTotal: string;
  taxTotal: string;
  differenceAmount: string;
  differenceDirection: ExchangeDirection;
};
