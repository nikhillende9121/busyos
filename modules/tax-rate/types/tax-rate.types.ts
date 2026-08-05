export type TaxRateView = {
  id: string;
  name: string;
  hsnCode: string | null;
  sacCode: string | null;
  ratePercent: string;
  cessPercent: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
