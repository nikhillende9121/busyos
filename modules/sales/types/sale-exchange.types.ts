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
