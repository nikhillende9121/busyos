import type { RegisterDeviceTokenInput, UnregisterDeviceTokenInput, ListNotificationsQueryInput } from "../schema/notification.schema";

export interface RegisterDeviceTokenDto extends RegisterDeviceTokenInput {
  tenantId: bigint;
  userId: bigint;
}

export interface UnregisterDeviceTokenDto extends UnregisterDeviceTokenInput {
  tenantId: bigint;
  userId: bigint;
}

export interface ListNotificationsQueryDto extends ListNotificationsQueryInput {
  tenantId: bigint;
  userId: bigint;
}
