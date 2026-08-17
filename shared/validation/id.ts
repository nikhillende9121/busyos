import { z } from "zod";

// Every id in prisma/schema.prisma is BigInt. Across HTTP bodies and query
// params, ids can arrive as strings ("123") or numbers (123). This schema
// coerces numbers/bigints to string and validates that the value is a valid numeric string.
export const idString = z.preprocess(
  (val) => (typeof val === "number" || typeof val === "bigint" ? String(val) : val),
  z.string({ invalid_type_error: "must be a numeric id" }).regex(/^\d+$/, "must be a numeric id"),
) as unknown as z.ZodType<string, z.ZodTypeDef, string | number | bigint>;

// Optional variant that safely handles empty strings (""), null, undefined, and "__none__"
// by coercing them to undefined, avoiding false "must be a numeric id" errors on empty optional fields.
export const optionalIdString = z.preprocess(
  (val) => {
    if (val === "" || val === null || val === undefined || val === "__none__") {
      return undefined;
    }
    if (typeof val === "number" || typeof val === "bigint") {
      return String(val);
    }
    return val;
  },
  z.string({ invalid_type_error: "must be a numeric id" }).regex(/^\d+$/, "must be a numeric id").optional(),
) as unknown as z.ZodType<string | undefined, z.ZodTypeDef, string | undefined>;
