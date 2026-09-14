export type UpsertCreditConfigDto = {
  tenantId: bigint;
  customerId: bigint;
  creditLimit?: string | null;
  settlementDay?: number | null;
};

export type RecordOpeningBalanceDto = {
  tenantId: bigint;
  customerId: bigint;
  amount: string;
  remarks?: string;
  createdBy?: bigint;
};

export type RecordCreditChargeDto = {
  tenantId: bigint;
  customerId: bigint;
  amount: string;
  referenceId: bigint;
  createdBy?: bigint;
};

export type RecordCreditNoteDto = {
  tenantId: bigint;
  customerId: bigint;
  amount: string;
  referenceId: bigint;
  createdBy?: bigint;
};

export type RecordCreditPaymentDto = {
  tenantId: bigint;
  customerId: bigint;
  amount: string;
  paymentMethod: "CASH" | "CARD" | "BANK_TRANSFER" | "UPI" | "CHEQUE";
  remarks?: string;
  createdBy?: bigint;
};

export type ListCreditTransactionsDto = {
  tenantId: bigint;
  customerId: bigint;
  page: number;
  pageSize: number;
};

export type CreditReportDto = {
  tenantId: bigint;
  page: number;
  pageSize: number;
};
