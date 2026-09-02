export type WebhookIntegrationView = {
  id: string;
  apiKey: string;
  // Only present on the create/regenerate response — never on a plain GET.
  // See Docs/webhooks.md §7 ("shown once").
  apiSecret?: string;
  defaultOnlineWarehouseId: string | null;
  isEnabled: boolean;
  createdAt: string;
};

export type WebhookEndpointView = {
  id: string;
  url: string;
  isActive: boolean;
  eventTypes: string[];
  // Only present on the create response — never on a plain GET/list.
  signingSecret?: string;
  lastDelivery: { status: string; createdAt: string } | null;
  createdAt: string;
};

export type WebhookDeliveryView = {
  id: string;
  eventType: string;
  status: string;
  httpStatusCode: number | null;
  attemptCount: number;
  createdAt: string;
  lastAttemptedAt: string | null;
};
