import { z } from "zod";

// No tenantCode: a Super Admin isn't tenant-scoped at all — see
// prisma/schema.prisma's SuperAdmin model.
export const superAdminLoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type SuperAdminLoginInput = z.infer<typeof superAdminLoginSchema>;

export const superAdminRefreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type SuperAdminRefreshInput = z.infer<typeof superAdminRefreshSchema>;
