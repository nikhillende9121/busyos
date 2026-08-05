import { prisma } from "./prisma";

// Prisma 7's generated client does not export a usable `Prisma.TransactionClient`
// type (only present as `any` in an internal, unused scripts file) — derived
// here from $transaction's own interactive-callback overload instead of
// hardcoding a type name that doesn't actually exist in this version.
//
// Used by any repository method that must be composable inside another
// module's transaction (see modules/inventory/repository/inventory.repository.ts
// for why: DATABASE.md -> Transaction Rules requires a ledger write and its
// balance update to commit or roll back together with whatever business
// write triggered them).
type TransactionCallback = Parameters<typeof prisma.$transaction>[0];
export type Db = TransactionCallback extends (client: infer C) => unknown ? C : never;
