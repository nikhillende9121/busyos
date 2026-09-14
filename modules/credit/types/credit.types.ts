// Response shapes returned to clients — see MODULES.md -> types/ and
// Docs/credit_module_plan.md §3. Ids as strings, amounts as decimal strings
// (never numbers — see shared/validation/decimal.ts).

export type CustomerCreditView = {
  customerId: string;
  customerName: string;
  creditLimit: string | null;
  settlementDay: number | null;
  currentBalance: string;
};

// POS-facing — deliberately smaller than CustomerCreditView (no
// settlementDay, no customerName; the POS already knows who it picked).
// See Docs/credit_module_plan.md §10.
export type CreditSummaryView = {
  currentBalance: string;
  creditLimit: string | null;
  availableCredit: string | null;
};

export type CreditTransactionView = {
  id: string;
  type: "OPENING" | "SALE_CHARGE" | "PAYMENT" | "CREDIT_NOTE" | "ADJUSTMENT";
  direction: "IN" | "OUT";
  amount: string;
  paymentMethod: string | null;
  referenceType: "SALE" | "SALE_RETURN" | "MANUAL" | null;
  referenceId: string | null;
  remarks: string | null;
  runningBalance: string;
  createdAt: string;
};

export type CreditReportRowView = {
  customerId: string;
  customerName: string;
  totalCredit: string;
  paymentsReceived: string;
  pending: string;
  creditLimit: string | null;
  settlementDay: number | null;
};
