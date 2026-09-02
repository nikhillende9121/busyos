export type CreateWebhookEndpointDto = {
  tenantId: bigint;
  url: string;
  eventTypes: string[];
};

export type UpdateWebhookEndpointDto = {
  tenantId: bigint;
  endpointId: bigint;
  url?: string;
  eventTypes?: string[];
  isActive?: boolean;
};

export type DeleteWebhookEndpointDto = {
  tenantId: bigint;
  endpointId: bigint;
};

export type SendTestEventDto = {
  tenantId: bigint;
  endpointId: bigint;
};

export type ListDeliveriesDto = {
  tenantId: bigint;
  endpointId: bigint;
  page: number;
  pageSize: number;
};

export type UpdateIntegrationDto = {
  tenantId: bigint;
  defaultOnlineWarehouseId?: bigint | null;
  isEnabled?: boolean;
};

export type CreateInboundOrderDto = {
  tenantId: bigint;
  integrationId: bigint;
  defaultWarehouseId: bigint | null;
  idempotencyKey?: string;
  requestHash: string;
  externalOrderReference?: string;
  customerId?: bigint | null;
  items: { skuOrBarcode: string; quantity: string }[];
  couponCode?: string;
};
