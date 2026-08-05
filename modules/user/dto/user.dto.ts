export type CreateUserDto = {
  tenantId: bigint;
  name: string;
  email: string;
  password: string;
  roleId: bigint;
  createdBy?: bigint;
  // The new user's own warehouse assignment (see prisma/schema.prisma's
  // User.warehouseId) — not the caller's scope.
  warehouseId?: bigint | null;
};

export type UpdateUserDto = {
  tenantId: bigint;
  userId: bigint;
  name?: string;
  roleId?: bigint;
  status?: "ACTIVE" | "INACTIVE" | "INVITED";
  updatedBy?: bigint;
  // undefined = leave unchanged; null = clear (unrestrict); set = reassign
  // to that store.
  warehouseId?: bigint | null;
};
