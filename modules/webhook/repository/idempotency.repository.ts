import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";

// Wraps the existing (previously unused) IdempotencyKey model — see
// Docs/webhooks.md §4. Generic infra (not webhook-specific), but this is
// its first real caller, so it lives alongside the feature that finally
// wires it up rather than a premature shared/ location.
export const idempotencyRepository = {
  findByTenantAndKey(tenantId: bigint, key: string) {
    return prisma.idempotencyKey.findUnique({ where: { tenantId_key: { tenantId, key } } });
  },

  create(data: Prisma.IdempotencyKeyUncheckedCreateInput) {
    return prisma.idempotencyKey.create({ data });
  },
};
