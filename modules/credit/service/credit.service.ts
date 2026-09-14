import { Prisma } from "@prisma/client";
import type { CreditTransaction, CreditDirection, CreditTransactionType, CreditReferenceType, PaymentMethod } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import { creditRepository } from "../repository/credit.repository";
import { AppError } from "@/shared/errors/app-error";
import { buildPagination, type Paginated } from "@/shared/utils/pagination";
import type {
  UpsertCreditConfigDto,
  RecordOpeningBalanceDto,
  RecordCreditChargeDto,
  RecordCreditNoteDto,
  RecordCreditPaymentDto,
  ListCreditTransactionsDto,
  CreditReportDto,
} from "../dto/credit.dto";
import type {
  CustomerCreditView,
  CreditSummaryView,
  CreditTransactionView,
  CreditReportRowView,
} from "../types/credit.types";

// Resolution order: a customer's own override wins; otherwise fall back to
// the tenant-wide default; null on both means unlimited — same "null is
// unlimited" convention as Plan.maxWarehouses (shared/utils/plan-limits.ts).
// See Docs/credit_module_plan.md §3.3.
async function resolveEffectiveLimit(
  tenantId: bigint,
  customerLimit: Prisma.Decimal | null,
): Promise<Prisma.Decimal | null> {
  if (customerLimit !== null) return customerLimit;
  return creditRepository.findTenantDefaultCreditLimit(tenantId);
}

async function assertCustomerExists(tenantId: bigint, customerId: bigint): Promise<{ name: string }> {
  const customer = await creditRepository.findCustomerForTenant(tenantId, customerId);
  if (!customer) {
    throw new AppError("RESOURCE_NOT_FOUND", "Customer not found");
  }
  return { name: customer.name };
}

// Core ledger write shared by every mutation below: lock the account row,
// compute the new balance, insert the CreditTransaction snapshot, persist
// the new balance — all inside one transaction (caller's, if supplied, so
// e.g. a credit sale's Payment/CreditTransaction rows commit or roll back
// together with the Sale itself; see Docs/credit_module_plan.md §7).
async function applyLedgerEntry(
  tx: Db,
  params: {
    tenantId: bigint;
    customerId: bigint;
    type: CreditTransactionType;
    direction: CreditDirection;
    amount: string;
    paymentMethod?: PaymentMethod | null;
    referenceType?: CreditReferenceType | null;
    referenceId?: bigint | null;
    remarks?: string | null;
    createdBy?: bigint;
    enforceLimit: boolean;
  },
): Promise<CreditTransaction> {
  const account = await creditRepository.ensureAndLockAccount(tx, params.tenantId, params.customerId);
  const amount = new Prisma.Decimal(params.amount);

  let newBalance: Prisma.Decimal;
  if (params.direction === "OUT") {
    newBalance = account.currentBalance.add(amount);
    if (params.enforceLimit) {
      const limit = await resolveEffectiveLimit(params.tenantId, account.creditLimit);
      if (limit !== null && newBalance.greaterThan(limit)) {
        throw new AppError("CREDIT_LIMIT_EXCEEDED", "This would exceed the customer's credit limit", {
          currentBalance: account.currentBalance.toString(),
          creditLimit: limit.toString(),
          attemptedChargeAmount: amount.toString(),
        });
      }
    }
  } else {
    // IN: a payment or credit note only ever reduces the balance. Clamped
    // at zero rather than allowed to go negative — whether an overpayment
    // should instead create a customer-favor balance is an open product
    // question (Docs/credit_module_plan.md §11.2); clamping is the
    // conservative default until that's decided. recordPayment() below
    // additionally rejects an overpayment outright rather than silently
    // clamping it, since a manual payment is a discrete user action, not a
    // proportional system-computed amount like a credit note.
    newBalance = Prisma.Decimal.max(account.currentBalance.sub(amount), 0);
  }

  await creditRepository.updateBalance(tx, params.customerId, newBalance);
  return creditRepository.createTransaction(tx, {
    tenantId: params.tenantId,
    customerId: params.customerId,
    type: params.type,
    direction: params.direction,
    amount,
    runningBalance: newBalance,
    paymentMethod: params.paymentMethod ?? null,
    referenceType: params.referenceType ?? null,
    referenceId: params.referenceId ?? null,
    remarks: params.remarks ?? null,
    createdBy: params.createdBy,
  });
}

export const creditService = {
  async getConfig(tenantId: bigint, customerId: bigint): Promise<CustomerCreditView> {
    const customer = await assertCustomerExists(tenantId, customerId);
    const account = await creditRepository.findAccountByCustomer(customerId);
    return {
      customerId: customerId.toString(),
      customerName: customer.name,
      creditLimit: account?.creditLimit?.toString() ?? null,
      settlementDay: account?.settlementDay ?? null,
      currentBalance: account?.currentBalance.toString() ?? "0",
    };
  },

  // POS-facing — see Docs/credit_module_plan.md §10. Deliberately smaller
  // than getConfig(): no name, no settlementDay.
  async getSummary(tenantId: bigint, customerId: bigint): Promise<CreditSummaryView> {
    await assertCustomerExists(tenantId, customerId);
    const account = await creditRepository.findAccountByCustomer(customerId);
    const currentBalance = account?.currentBalance ?? new Prisma.Decimal(0);
    const limit = await resolveEffectiveLimit(tenantId, account?.creditLimit ?? null);
    return {
      currentBalance: currentBalance.toString(),
      creditLimit: limit?.toString() ?? null,
      availableCredit: limit === null ? null : Prisma.Decimal.max(limit.sub(currentBalance), 0).toString(),
    };
  },

  async upsertConfig(dto: UpsertCreditConfigDto): Promise<CustomerCreditView> {
    await assertCustomerExists(dto.tenantId, dto.customerId);
    await creditRepository.upsertConfig(dto.tenantId, dto.customerId, {
      creditLimit: dto.creditLimit === undefined ? undefined : dto.creditLimit === null ? null : new Prisma.Decimal(dto.creditLimit),
      settlementDay: dto.settlementDay,
    });
    return creditService.getConfig(dto.tenantId, dto.customerId);
  },

  // One-time — only when the customer has no prior ledger at all (a real
  // opening balance predates this system; recording one for a customer who
  // already has credit activity here would double-count). Not
  // limit-checked: an opening balance is a fact being recorded, not a new
  // charge being authorized.
  async recordOpeningBalance(dto: RecordOpeningBalanceDto): Promise<CreditTransactionView> {
    await assertCustomerExists(dto.tenantId, dto.customerId);
    const existingCount = await creditRepository.countTransactions(dto.tenantId, dto.customerId);
    if (existingCount > 0) {
      throw new AppError(
        "CONFLICT",
        "This customer already has credit transaction history — an opening balance can only be recorded once, before any other activity",
      );
    }
    const transaction = await prisma.$transaction((tx) =>
      applyLedgerEntry(tx, {
        tenantId: dto.tenantId,
        customerId: dto.customerId,
        type: "OPENING",
        direction: "OUT",
        amount: dto.amount,
        referenceType: "MANUAL",
        remarks: dto.remarks,
        createdBy: dto.createdBy,
        enforceLimit: false,
      }),
    );
    return toCreditTransactionView(transaction);
  },

  // Called from sale.service.ts when a sale's payment method is CREDIT —
  // never exposed via its own route (see Docs/credit_module_plan.md §6).
  // Composable with the caller's own transaction so it commits/rolls back
  // atomically with the Sale + Payment rows.
  async recordCharge(dto: RecordCreditChargeDto, tx: Db): Promise<CreditTransaction> {
    return applyLedgerEntry(tx, {
      tenantId: dto.tenantId,
      customerId: dto.customerId,
      type: "SALE_CHARGE",
      direction: "OUT",
      amount: dto.amount,
      paymentMethod: "CREDIT",
      referenceType: "SALE",
      referenceId: dto.referenceId,
      createdBy: dto.createdBy,
      enforceLimit: true,
    });
  },

  // Called from sale-return.service.ts — see Docs/credit_module_plan.md §9.
  async recordCreditNote(dto: RecordCreditNoteDto, tx: Db): Promise<CreditTransaction> {
    return applyLedgerEntry(tx, {
      tenantId: dto.tenantId,
      customerId: dto.customerId,
      type: "CREDIT_NOTE",
      direction: "IN",
      amount: dto.amount,
      referenceType: "SALE_RETURN",
      referenceId: dto.referenceId,
      createdBy: dto.createdBy,
      enforceLimit: false,
    });
  },

  // A manual cash/UPI/etc. settlement — rejected outright (not silently
  // clamped) if it exceeds the outstanding balance, since this is a
  // discrete user-entered amount, not a system-computed proportion. See
  // Docs/credit_module_plan.md §11.2 (open question on overpayment).
  async recordPayment(dto: RecordCreditPaymentDto): Promise<CreditTransactionView> {
    await assertCustomerExists(dto.tenantId, dto.customerId);
    const account = await creditRepository.findAccountByCustomer(dto.customerId);
    const currentBalance = account?.currentBalance ?? new Prisma.Decimal(0);
    if (new Prisma.Decimal(dto.amount).greaterThan(currentBalance)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Payment amount (${dto.amount}) exceeds the outstanding balance (${currentBalance.toString()})`,
      );
    }
    const transaction = await prisma.$transaction((tx) =>
      applyLedgerEntry(tx, {
        tenantId: dto.tenantId,
        customerId: dto.customerId,
        type: "PAYMENT",
        direction: "IN",
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        referenceType: "MANUAL",
        remarks: dto.remarks,
        createdBy: dto.createdBy,
        enforceLimit: false,
      }),
    );
    return toCreditTransactionView(transaction);
  },

  async listTransactions(dto: ListCreditTransactionsDto): Promise<Paginated<CreditTransactionView>> {
    await assertCustomerExists(dto.tenantId, dto.customerId);
    const skip = (dto.page - 1) * dto.pageSize;
    const [transactions, total] = await Promise.all([
      creditRepository.listTransactions(dto.tenantId, dto.customerId, { skip, take: dto.pageSize }),
      creditRepository.countTransactions(dto.tenantId, dto.customerId),
    ]);
    return {
      items: transactions.map(toCreditTransactionView),
      pagination: buildPagination(dto.page, dto.pageSize, total),
    };
  },

  async getReport(dto: CreditReportDto): Promise<Paginated<CreditReportRowView>> {
    const skip = (dto.page - 1) * dto.pageSize;
    const [accounts, total] = await Promise.all([
      creditRepository.listAccountsForReport(dto.tenantId, { skip, take: dto.pageSize }),
      creditRepository.countAccountsForReport(dto.tenantId),
    ]);
    const sums = await creditRepository.sumTransactionsByDirection(
      dto.tenantId,
      accounts.map((account) => account.customerId),
    );
    return {
      items: accounts.map((account) => {
        const sum = sums.get(account.customerId.toString()) ?? {
          out: new Prisma.Decimal(0),
          in: new Prisma.Decimal(0),
        };
        return {
          customerId: account.customerId.toString(),
          customerName: account.customer.name,
          totalCredit: sum.out.toString(),
          paymentsReceived: sum.in.toString(),
          pending: account.currentBalance.toString(),
          creditLimit: account.creditLimit?.toString() ?? null,
          settlementDay: account.settlementDay,
        };
      }),
      pagination: buildPagination(dto.page, dto.pageSize, total),
    };
  },
};

function toCreditTransactionView(transaction: CreditTransaction): CreditTransactionView {
  return {
    id: transaction.id.toString(),
    type: transaction.type,
    direction: transaction.direction,
    amount: transaction.amount.toString(),
    paymentMethod: transaction.paymentMethod,
    referenceType: transaction.referenceType,
    referenceId: transaction.referenceId?.toString() ?? null,
    remarks: transaction.remarks,
    runningBalance: transaction.runningBalance.toString(),
    createdAt: transaction.createdAt.toISOString(),
  };
}
