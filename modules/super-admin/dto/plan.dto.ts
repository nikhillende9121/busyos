export type CreatePlanDto = {
  name: string;
  price: string;
  billingCycle: "MONTHLY" | "YEARLY";
  featureCodes?: string[];
  // Quota a subscribed tenant may not exceed when creating a new
  // Warehouse/User — omitted/undefined means unlimited. See
  // shared/utils/plan-limits.ts.
  maxWarehouses?: number;
  maxUsers?: number;
};
