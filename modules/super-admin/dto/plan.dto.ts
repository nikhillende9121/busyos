export type CreatePlanDto = {
  name: string;
  price: string;
  billingCycle: "MONTHLY" | "YEARLY";
  featureCodes?: string[];
};
