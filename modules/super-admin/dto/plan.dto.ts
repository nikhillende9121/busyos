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

// Full replace, not partial — see plan.service.ts's update().
export type UpdatePlanDto = {
  planId: bigint;
  name: string;
  price: string;
  billingCycle: "MONTHLY" | "YEARLY";
  featureCodes?: string[];
  maxWarehouses?: number;
  maxUsers?: number;
};
