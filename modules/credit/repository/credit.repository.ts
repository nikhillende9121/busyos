import { Prisma } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";

export const creditRepository = {
  findCustomerForTenant(tenantId: bigint, customerId: bigint) {
    return prisma.customer.findFirst({ where: { id: customerId, tenantId, deletedAt: null } });
  },

  findAccountByCustomer(customerId: bigint) {
    return prisma.customerCredit.findUnique({ where: { customerId } });
  },

  // null = tenant has no default configured — see Docs/credit_module_plan.md §3.3.
  async findTenantDefaultCreditLimit(tenantId: bigint): Promise<Prisma.Decimal | null> {
    const setting = await prisma.tenantSetting.findUnique({
      where: { tenantId },
      select: { defaultCreditLimit: true },
    });
    return setting?.defaultCreditLimit ?? null;
  },

  // Config (limit override, settlement day) is a plain upsert — unlike the
  // balance below, it's never mutated concurrently from two different
  // requests in a way that needs row-level locking.
  upsertConfig(
    tenantId: bigint,
    customerId: bigint,
    data: { creditLimit?: Prisma.Decimal | null; settlementDay?: number | null },
  ) {
    return prisma.customerCredit.upsert({
      where: { customerId },
      create: { tenantId, customerId, ...data },
      update: data,
    });
  },

  // Same two-statement "ensure row exists, then lock it" shape as
  // modules/inventory/repository/inventory.repository.ts's
  // ensureAndLockBalance, for the same reason: a first-ever credit
  // transaction for a customer has no CustomerCredit row yet, and
  // `SELECT ... FOR UPDATE` can't lock a row that doesn't exist. Locking
  // here is what makes the credit-limit check in credit.service.ts
  // race-safe against two concurrent credit sales for the same customer.
  async ensureAndLockAccount(
    tx: Db,
    tenantId: bigint,
    customerId: bigint,
  ): Promise<{ creditLimit: Prisma.Decimal | null; currentBalance: Prisma.Decimal }> {
    await tx.$executeRaw`
      INSERT INTO customer_credits (tenantId, customerId, currentBalance, createdAt, updatedAt)
      VALUES (${tenantId}, ${customerId}, 0, NOW(), NOW())
      ON DUPLICATE KEY UPDATE currentBalance = currentBalance
    `;
    const rows = await tx.$queryRaw<{ creditLimit: unknown; currentBalance: unknown }[]>`
      SELECT creditLimit, currentBalance FROM customer_credits
      WHERE customerId = ${customerId}
      FOR UPDATE
    `;
    const row = rows[0];
    return {
      creditLimit: row.creditLimit === null ? null : new Prisma.Decimal(row.creditLimit as Prisma.Decimal.Value),
      currentBalance: new Prisma.Decimal(row.currentBalance as Prisma.Decimal.Value),
    };
  },

  updateBalance(tx: Db, customerId: bigint, newBalance: Prisma.Decimal) {
    return tx.customerCredit.update({ where: { customerId }, data: { currentBalance: newBalance } });
  },

  createTransaction(tx: Db, data: Prisma.CreditTransactionUncheckedCreateInput) {
    return tx.creditTransaction.create({ data });
  },

  listTransactions(
    tenantId: bigint,
    customerId: bigint,
    pagination: { skip: number; take: number },
  ) {
    return prisma.creditTransaction.findMany({
      where: { tenantId, customerId },
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    });
  },

  countTransactions(tenantId: bigint, customerId: bigint) {
    return prisma.creditTransaction.count({ where: { tenantId, customerId } });
  },

  // Report is customer-wise over every customer that has ever had credit
  // activity — i.e. has a CustomerCredit row (created by an opening
  // balance or a first credit sale), not every customer in the tenant.
  listAccountsForReport(tenantId: bigint, pagination: { skip: number; take: number }) {
    return prisma.customerCredit.findMany({
      where: { tenantId },
      include: { customer: true },
      orderBy: { customer: { name: "asc" } },
      skip: pagination.skip,
      take: pagination.take,
    });
  },

  countAccountsForReport(tenantId: bigint) {
    return prisma.customerCredit.count({ where: { tenantId } });
  },

  // OUT-sum (total credit extended: OPENING + SALE_CHARGE) and IN-sum
  // (payments received: PAYMENT + CREDIT_NOTE) per customer, batched for a
  // whole report page rather than one query per row.
  async sumTransactionsByDirection(
    tenantId: bigint,
    customerIds: bigint[],
  ): Promise<Map<string, { out: Prisma.Decimal; in: Prisma.Decimal }>> {
    if (customerIds.length === 0) return new Map();
    const grouped = await prisma.creditTransaction.groupBy({
      by: ["customerId", "direction"],
      where: { tenantId, customerId: { in: customerIds } },
      _sum: { amount: true },
    });
    const result = new Map<string, { out: Prisma.Decimal; in: Prisma.Decimal }>();
    for (const row of grouped) {
      const key = row.customerId.toString();
      const existing = result.get(key) ?? { out: new Prisma.Decimal(0), in: new Prisma.Decimal(0) };
      const sum = row._sum.amount ?? new Prisma.Decimal(0);
      if (row.direction === "OUT") {
        existing.out = existing.out.add(sum);
      } else {
        existing.in = existing.in.add(sum);
      }
      result.set(key, existing);
    }
    return result;
  },
};
