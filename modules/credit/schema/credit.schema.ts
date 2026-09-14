import { z } from "zod";
import { nullableNonNegativeDecimalString, positiveDecimalString } from "@/shared/validation/decimal";
import { paginationQueryFields } from "@/shared/validation/list-query";

export const upsertCreditConfigSchema = z.object({
  creditLimit: nullableNonNegativeDecimalString,
  // Day-of-month for the monthly settlement reminder. Capped at 28 so it's
  // valid in every month (no Feb-29/30/31 edge case to resolve later) — see
  // Docs/credit_module_plan.md §3.1.
  settlementDay: z.number().int().min(1).max(28).nullable().optional(),
});
export type UpsertCreditConfigInput = z.infer<typeof upsertCreditConfigSchema>;

export const recordOpeningBalanceSchema = z.object({
  amount: positiveDecimalString,
  remarks: z.string().max(255).optional(),
});
export type RecordOpeningBalanceInput = z.infer<typeof recordOpeningBalanceSchema>;

// Never CREDIT itself — a settlement is always paid via some other method
// (see Docs/credit_module_plan.md §6/§9 of credit_androidChanges.md).
export const recordCreditPaymentSchema = z.object({
  amount: positiveDecimalString,
  paymentMethod: z.enum(["CASH", "CARD", "BANK_TRANSFER", "UPI", "CHEQUE"]),
  remarks: z.string().max(255).optional(),
});
export type RecordCreditPaymentInput = z.infer<typeof recordCreditPaymentSchema>;

export const listCreditTransactionsQuerySchema = z.object({
  ...paginationQueryFields,
});
export type ListCreditTransactionsQuery = z.infer<typeof listCreditTransactionsQuerySchema>;

export const creditReportQuerySchema = z.object({
  ...paginationQueryFields,
});
export type CreditReportQuery = z.infer<typeof creditReportQuerySchema>;
