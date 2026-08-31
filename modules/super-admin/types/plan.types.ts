export type PlanView = {
  id: string;
  name: string;
  price: string;
  billingCycle: string;
  // null means unlimited — see shared/utils/plan-limits.ts.
  maxWarehouses: number | null;
  maxUsers: number | null;
  maxRoles: number | null;
  features: string[];
  createdAt: string;
  updatedAt: string;
};
