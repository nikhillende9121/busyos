export type UnitView = {
  id: string;
  name: string;
  symbol: string;
  // true for the shared system catalog (tenantId = null in prisma/schema.prisma),
  // which only Super Admin can create/edit — see DATABASE.md -> Unit.
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
};
