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
