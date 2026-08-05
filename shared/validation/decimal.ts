import { z } from "zod";

// Decimal-string validation shared across modules that accept Prisma
// Decimal-backed quantities/prices (inventory, purchase, sales, ...) — see
// shared/validation/id.ts for why numeric values cross the wire as strings.
export const nonNegativeDecimalString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "must be a non-negative decimal");

export const positiveDecimalString = nonNegativeDecimalString.refine(
  (value) => Number(value) > 0,
  "must be greater than zero",
);
