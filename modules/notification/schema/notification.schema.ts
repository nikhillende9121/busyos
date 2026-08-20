import { z } from "zod";

export const registerDeviceTokenSchema = z.object({
  deviceId: z.string().min(1, "deviceId is required"),
  fcmToken: z.string().min(1, "fcmToken is required"),
  platform: z.enum(["ANDROID", "WEB", "IOS"]).default("ANDROID"),
  deviceModel: z.string().optional(),
});

export const unregisterDeviceTokenSchema = z.object({
  fcmToken: z.string().min(1, "fcmToken is required"),
});

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  unreadOnly: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === "1"),
});

export type RegisterDeviceTokenInput = z.infer<typeof registerDeviceTokenSchema>;
export type UnregisterDeviceTokenInput = z.infer<typeof unregisterDeviceTokenSchema>;
export type ListNotificationsQueryInput = z.infer<typeof listNotificationsQuerySchema>;
