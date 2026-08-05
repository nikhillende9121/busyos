export type ExtraChargeView = {
  id: string;
  name: string;
  calcType: "FLAT" | "PERCENTAGE";
  value: string;
  isTaxable: boolean;
  taxRateId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
