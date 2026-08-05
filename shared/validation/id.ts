import { z } from "zod";

// Every id in prisma/schema.prisma is BigInt, and BigInt can't round-trip
// through a JS number (precision loss above 2^53) — so ids cross the wire
// as numeric strings, in both JSON bodies and query params, and get
// converted with BigInt(...) only after this schema confirms they're safe
// to convert. Reused across every module's schema/ + controller/ instead
// of each one redefining the same regex.
export const idString = z.string().regex(/^\d+$/, "must be a numeric id");
