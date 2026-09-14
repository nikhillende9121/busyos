import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/shared/database/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback("credit-tx")),
  },
}));

vi.mock("../repository/credit.repository", () => ({
  creditRepository: {
    findCustomerForTenant: vi.fn(),
    findAccountByCustomer: vi.fn(),
    findTenantDefaultCreditLimit: vi.fn(),
    upsertConfig: vi.fn(),
    ensureAndLockAccount: vi.fn(),
    updateBalance: vi.fn(),
    createTransaction: vi.fn(),
    listTransactions: vi.fn(),
    countTransactions: vi.fn(),
    listAccountsForReport: vi.fn(),
    countAccountsForReport: vi.fn(),
    sumTransactionsByDirection: vi.fn(),
  },
}));

import type { CreditTransaction } from "@prisma/client";
import { creditRepository } from "../repository/credit.repository";
import { creditService } from "../service/credit.service";

const TENANT_ID = 1n;
const CUSTOMER_ID = 5n;

function decimalTransactionRow(overrides: Partial<CreditTransaction> = {}): CreditTransaction {
  return {
    id: 100n,
    tenantId: TENANT_ID,
    customerId: CUSTOMER_ID,
    type: "SALE_CHARGE",
    direction: "OUT",
    amount: new Prisma.Decimal(1000),
    runningBalance: new Prisma.Decimal(1000),
    paymentMethod: "CREDIT",
    referenceType: "SALE",
    referenceId: 55n,
    remarks: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    createdBy: 2n,
    ...overrides,
  };
}

describe("creditService.getSummary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(creditRepository.findCustomerForTenant).mockResolvedValue({ id: CUSTOMER_ID, name: "Acme" } as never);
  });

  it("resolves the customer's own override over the tenant default", async () => {
    vi.mocked(creditRepository.findAccountByCustomer).mockResolvedValue({
      customerId: CUSTOMER_ID,
      creditLimit: new Prisma.Decimal(5000),
      currentBalance: new Prisma.Decimal(2000),
    } as never);
    vi.mocked(creditRepository.findTenantDefaultCreditLimit).mockResolvedValue(new Prisma.Decimal(10000));

    const summary = await creditService.getSummary(TENANT_ID, CUSTOMER_ID);

    expect(summary.creditLimit).toBe("5000");
    expect(summary.availableCredit).toBe("3000");
    expect(summary.currentBalance).toBe("2000");
  });

  it("falls back to the tenant default when the customer has no override", async () => {
    vi.mocked(creditRepository.findAccountByCustomer).mockResolvedValue({
      customerId: CUSTOMER_ID,
      creditLimit: null,
      currentBalance: new Prisma.Decimal(1500),
    } as never);
    vi.mocked(creditRepository.findTenantDefaultCreditLimit).mockResolvedValue(new Prisma.Decimal(10000));

    const summary = await creditService.getSummary(TENANT_ID, CUSTOMER_ID);

    expect(summary.creditLimit).toBe("10000");
    expect(summary.availableCredit).toBe("8500");
  });

  it("is unlimited (null) when neither the customer nor the tenant has a limit configured", async () => {
    vi.mocked(creditRepository.findAccountByCustomer).mockResolvedValue({
      customerId: CUSTOMER_ID,
      creditLimit: null,
      currentBalance: new Prisma.Decimal(1500),
    } as never);
    vi.mocked(creditRepository.findTenantDefaultCreditLimit).mockResolvedValue(null);

    const summary = await creditService.getSummary(TENANT_ID, CUSTOMER_ID);

    expect(summary.creditLimit).toBeNull();
    expect(summary.availableCredit).toBeNull();
  });

  it("throws RESOURCE_NOT_FOUND for a customer outside the tenant", async () => {
    vi.mocked(creditRepository.findCustomerForTenant).mockResolvedValue(null);

    await expect(creditService.getSummary(TENANT_ID, CUSTOMER_ID)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });
});

describe("creditService.recordCharge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("blocks a charge that would exceed the effective limit", async () => {
    vi.mocked(creditRepository.ensureAndLockAccount).mockResolvedValue({
      creditLimit: new Prisma.Decimal(5000),
      currentBalance: new Prisma.Decimal(4500),
    });

    await expect(
      creditService.recordCharge(
        { tenantId: TENANT_ID, customerId: CUSTOMER_ID, amount: "1000", referenceId: 55n },
        "tx" as never,
      ),
    ).rejects.toMatchObject({ code: "CREDIT_LIMIT_EXCEEDED" });

    expect(creditRepository.updateBalance).not.toHaveBeenCalled();
    expect(creditRepository.createTransaction).not.toHaveBeenCalled();
  });

  it("allows a charge that lands exactly on the limit", async () => {
    vi.mocked(creditRepository.ensureAndLockAccount).mockResolvedValue({
      creditLimit: new Prisma.Decimal(5000),
      currentBalance: new Prisma.Decimal(4000),
    });
    vi.mocked(creditRepository.createTransaction).mockResolvedValue(decimalTransactionRow());

    await creditService.recordCharge(
      { tenantId: TENANT_ID, customerId: CUSTOMER_ID, amount: "1000", referenceId: 55n },
      "tx" as never,
    );

    expect(creditRepository.updateBalance).toHaveBeenCalledWith("tx", CUSTOMER_ID, new Prisma.Decimal(5000));
  });

  it("never limit-checks when both the customer and tenant have no limit configured", async () => {
    vi.mocked(creditRepository.ensureAndLockAccount).mockResolvedValue({
      creditLimit: null,
      currentBalance: new Prisma.Decimal(999_999),
    });
    vi.mocked(creditRepository.findTenantDefaultCreditLimit).mockResolvedValue(null);
    vi.mocked(creditRepository.createTransaction).mockResolvedValue(decimalTransactionRow());

    await expect(
      creditService.recordCharge(
        { tenantId: TENANT_ID, customerId: CUSTOMER_ID, amount: "1000000", referenceId: 55n },
        "tx" as never,
      ),
    ).resolves.toBeDefined();
  });
});

describe("creditService.recordPayment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(creditRepository.findCustomerForTenant).mockResolvedValue({ id: CUSTOMER_ID, name: "Acme" } as never);
  });

  it("rejects a payment larger than the outstanding balance", async () => {
    vi.mocked(creditRepository.findAccountByCustomer).mockResolvedValue({
      customerId: CUSTOMER_ID,
      creditLimit: null,
      currentBalance: new Prisma.Decimal(500),
    } as never);

    await expect(
      creditService.recordPayment({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        amount: "600",
        paymentMethod: "CASH",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(creditRepository.ensureAndLockAccount).not.toHaveBeenCalled();
  });

  it("accepts a payment equal to the outstanding balance and zeroes it out", async () => {
    vi.mocked(creditRepository.findAccountByCustomer).mockResolvedValue({
      customerId: CUSTOMER_ID,
      creditLimit: null,
      currentBalance: new Prisma.Decimal(500),
    } as never);
    vi.mocked(creditRepository.ensureAndLockAccount).mockResolvedValue({
      creditLimit: null,
      currentBalance: new Prisma.Decimal(500),
    });
    vi.mocked(creditRepository.createTransaction).mockResolvedValue(
      decimalTransactionRow({ type: "PAYMENT", direction: "IN", amount: new Prisma.Decimal(500), runningBalance: new Prisma.Decimal(0) }),
    );

    const result = await creditService.recordPayment({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      amount: "500",
      paymentMethod: "CASH",
    });

    expect(result.runningBalance).toBe("0");
    expect(creditRepository.updateBalance).toHaveBeenCalledWith("credit-tx", CUSTOMER_ID, new Prisma.Decimal(0));
  });
});

describe("creditService.recordCreditNote", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("clamps at zero when the return exceeds the remaining outstanding balance", async () => {
    vi.mocked(creditRepository.ensureAndLockAccount).mockResolvedValue({
      creditLimit: null,
      currentBalance: new Prisma.Decimal(300),
    });
    vi.mocked(creditRepository.createTransaction).mockResolvedValue(
      decimalTransactionRow({ type: "CREDIT_NOTE", direction: "IN", amount: new Prisma.Decimal(500) }),
    );

    await creditService.recordCreditNote(
      { tenantId: TENANT_ID, customerId: CUSTOMER_ID, amount: "500", referenceId: 77n },
      "tx" as never,
    );

    expect(creditRepository.updateBalance).toHaveBeenCalledWith("tx", CUSTOMER_ID, new Prisma.Decimal(0));
  });

  it("is never limit-checked, even for a very large credit note", async () => {
    vi.mocked(creditRepository.ensureAndLockAccount).mockResolvedValue({
      creditLimit: new Prisma.Decimal(100),
      currentBalance: new Prisma.Decimal(50),
    });
    vi.mocked(creditRepository.createTransaction).mockResolvedValue(decimalTransactionRow());

    await expect(
      creditService.recordCreditNote(
        { tenantId: TENANT_ID, customerId: CUSTOMER_ID, amount: "50", referenceId: 77n },
        "tx" as never,
      ),
    ).resolves.toBeDefined();
  });
});

describe("creditService.recordOpeningBalance", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(creditRepository.findCustomerForTenant).mockResolvedValue({ id: CUSTOMER_ID, name: "Acme" } as never);
  });

  it("blocks a second opening balance once the customer already has ledger history", async () => {
    vi.mocked(creditRepository.countTransactions).mockResolvedValue(3);

    await expect(
      creditService.recordOpeningBalance({ tenantId: TENANT_ID, customerId: CUSTOMER_ID, amount: "1000" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(creditRepository.ensureAndLockAccount).not.toHaveBeenCalled();
  });

  it("records an opening balance for a customer with no prior history", async () => {
    vi.mocked(creditRepository.countTransactions).mockResolvedValue(0);
    vi.mocked(creditRepository.ensureAndLockAccount).mockResolvedValue({
      creditLimit: null,
      currentBalance: new Prisma.Decimal(0),
    });
    vi.mocked(creditRepository.createTransaction).mockResolvedValue(
      decimalTransactionRow({ type: "OPENING", amount: new Prisma.Decimal(1000), runningBalance: new Prisma.Decimal(1000) }),
    );

    const result = await creditService.recordOpeningBalance({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      amount: "1000",
    });

    expect(result.type).toBe("OPENING");
    expect(result.runningBalance).toBe("1000");
  });
});
