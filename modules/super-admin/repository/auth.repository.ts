import { prisma } from "@/shared/database/prisma";

export const superAdminAuthRepository = {
  findByEmail(email: string) {
    return prisma.superAdmin.findUnique({ where: { email } });
  },

  findById(id: bigint) {
    return prisma.superAdmin.findUnique({ where: { id } });
  },
};
