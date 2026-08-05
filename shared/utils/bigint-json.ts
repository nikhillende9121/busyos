// Every primary/foreign key in prisma/schema.prisma is BigInt (see
// Docs/DATABASE.md -> ID Strategy). JSON.stringify throws on a raw BigInt,
// so every response that touches one would crash with no polyfill.
//
// Services should still map Prisma results to explicit response types and
// call `.toString()` on ids themselves (see modules/tenant/service/tenant.service.ts
// for the pattern) — that's what keeps response shapes intentional and
// typed. This polyfill is the safety net underneath that: if an id ever
// slips through unconverted (a nested relation, a future module written by
// someone who forgets), the endpoint serializes it as a string instead of
// hard-crashing with "Do not know how to serialize a BigInt".
//
// Imported once for its side effect, from shared/database/prisma.ts, which
// every module that touches the database already imports.
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

if (!("toJSON" in BigInt.prototype)) {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    value(this: bigint) {
      return this.toString();
    },
  });
}

export {};
