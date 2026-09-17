import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import type { Prisma } from "@prisma/client";

// Platform-level catalog, no tenantId scoping anywhere here — same
// reasoning as super-admin/repository/tenant.repository.ts: only a Super
// Admin authors/assigns these (see prisma/schema.prisma's ReceiptFormat
// comment block).
const includeAssignments = { assignments: true } as const;

export const receiptFormatRepository = {
  findMany() {
    return prisma.receiptFormat.findMany({
      where: { deletedAt: null },
      include: includeAssignments,
      orderBy: { name: "asc" },
    });
  },

  findById(id: bigint) {
    return prisma.receiptFormat.findFirst({ where: { id, deletedAt: null }, include: includeAssignments });
  },

  findDefault() {
    return prisma.receiptFormat.findFirst({ where: { isDefault: true, deletedAt: null } });
  },

  create(db: Db, data: Prisma.ReceiptFormatCreateInput) {
    return db.receiptFormat.create({ data });
  },

  update(db: Db, id: bigint, data: Prisma.ReceiptFormatUpdateInput) {
    return db.receiptFormat.update({ where: { id }, data });
  },

  // Unassigns every scope pointing at this format in the same transaction
  // as the soft-delete, rather than leaving dangling assignment rows — a
  // tenant/store/POS assigned to a deleted format falls straight back down
  // the precedence chain (see receipt-format.service.ts's
  // resolveForTerminal) on its very next fetch.
  async softDelete(db: Db, id: bigint): Promise<void> {
    await db.receiptFormat.update({ where: { id }, data: { deletedAt: new Date() } });
    await db.receiptFormatAssignment.deleteMany({ where: { receiptFormatId: id } });
  },

  // Enforces "at most one global default" (see prisma/schema.prisma's
  // ReceiptFormat.isDefault comment) — a service-level invariant, not a DB
  // constraint.
  clearDefaultExcept(db: Db, id: bigint) {
    return db.receiptFormat.updateMany({
      where: { id: { not: id }, isDefault: true },
      data: { isDefault: false },
    });
  },

  findAssignmentByTenant(tenantId: bigint) {
    return prisma.receiptFormatAssignment.findUnique({
      where: { tenantId },
      include: { receiptFormat: true },
    });
  },

  findAssignmentByWarehouse(warehouseId: bigint) {
    return prisma.receiptFormatAssignment.findUnique({
      where: { warehouseId },
      include: { receiptFormat: true },
    });
  },

  findAssignmentByTerminal(terminalId: bigint) {
    return prisma.receiptFormatAssignment.findUnique({
      where: { terminalId },
      include: { receiptFormat: true },
    });
  },

  // Each scope has its own single-column unique index (see
  // prisma/schema.prisma's ReceiptFormatAssignment), so each is its own
  // natural upsert key — re-assigning a scope just repoints the existing
  // row instead of erroring on the constraint.
  upsertTenantAssignment(receiptFormatId: bigint, tenantId: bigint) {
    return prisma.receiptFormatAssignment.upsert({
      where: { tenantId },
      create: { receiptFormatId, tenantId },
      update: { receiptFormatId },
    });
  },

  upsertWarehouseAssignment(receiptFormatId: bigint, warehouseId: bigint) {
    return prisma.receiptFormatAssignment.upsert({
      where: { warehouseId },
      create: { receiptFormatId, warehouseId },
      update: { receiptFormatId },
    });
  },

  upsertTerminalAssignment(receiptFormatId: bigint, terminalId: bigint) {
    return prisma.receiptFormatAssignment.upsert({
      where: { terminalId },
      create: { receiptFormatId, terminalId },
      update: { receiptFormatId },
    });
  },

  findTerminalById(id: bigint) {
    return prisma.terminal.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, tenantId: true, warehouseId: true },
    });
  },

  findTenantById(id: bigint) {
    return prisma.tenant.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  },

  findWarehouseById(id: bigint) {
    return prisma.warehouse.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  },
};
