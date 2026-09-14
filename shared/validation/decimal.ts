import { z } from "zod";

// Decimal-string validation shared across modules that accept Prisma
// Decimal-backed quantities/prices. Accepts numbers or strings and coerces
// numbers to string.
export const nonNegativeDecimalString = z.preprocess(
  (val) => (typeof val === "number" ? String(val) : val),
  z.string().regex(/^\d+(\.\d+)?$/, "must be a non-negative decimal"),
);

export const positiveDecimalString = nonNegativeDecimalString.refine(
  (value) => Number(value) > 0,
  "must be greater than zero",
);

export const optionalNonNegativeDecimalString = z.preprocess(
  (val) => {
    if (val === "" || val === null || val === undefined) {
      return undefined;
    }
    if (typeof val === "number") {
      return String(val);
    }
    return val;
  },
  z.string().regex(/^\d+(\.\d+)?$/, "must be a non-negative decimal").optional(),
);

// Like optionalNonNegativeDecimalString, but null is preserved (not
// collapsed to undefined) — used where null is a meaningful "clear this
// limit back to unlimited" value distinct from "field omitted, leave
// unchanged" (see modules/credit/schema/credit.schema.ts).
export const nullableNonNegativeDecimalString = z.preprocess(
  (val) => {
    if (val === "") {
      return undefined;
    }
    if (typeof val === "number") {
      return String(val);
    }
    return val;
  },
  z.string().regex(/^\d+(\.\d+)?$/, "must be a non-negative decimal").nullable().optional(),
);
