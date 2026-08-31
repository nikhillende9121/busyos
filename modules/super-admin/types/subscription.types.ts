export type ContractView = {
  id: string;
  planId: string;
  planName: string;
  startDate: string;
  endDate: string;
  status: string;
  // Computed (status ACTIVE/TRIAL but endDate already passed), never
  // stored — nothing auto-flips TenantSubscription.status in this system.
  // See shared/utils/subscription.ts's isSubscriptionExpired().
  isExpiredByDate: boolean;
  priceAtSigning: string;
  createdAt: string;
};

// ContractView + which tenant it belongs to — the platform-wide Contracts
// overview page needs this; the per-tenant history dialog doesn't (the
// tenant is already the page context there).
export type ContractWithTenantView = ContractView & {
  tenantId: string;
  tenantName: string;
  tenantCode: string;
  // True for a currently-in-force contract (ACTIVE/TRIAL and not expired
  // by date) — lets the overview page sort/group "what's actually live"
  // to the top without re-deriving it from status + isExpiredByDate again.
  isCurrentlyActive: boolean;
  // Negative once past endDate. Computed server-side (not derived from
  // Date.now() client-side at render time) — same "never compute a
  // time-sensitive figure in the browser" precedent as daysUntilRenewal
  // (modules/auth/service/auth.service.ts) and daysRemaining
  // (modules/tenant/service/tenant.service.ts).
  daysRemaining: number;
};
