import "@/shared/utils/bigint-json";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// Prisma 7 requires a driver adapter at runtime (schema.prisma no longer
// carries a connection url — see prisma.config.ts and Docs/DATABASE.md ->
// Prisma 7 Driver Adapters). @prisma/adapter-mariadb speaks the MySQL wire
// protocol via the `mariadb` driver; its `provider` is "mysql", matching
// datasource db { provider = "mysql" } in schema.prisma.
declare global {
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaMariaDb(connectionString);
  return new PrismaClient({ adapter });
}

// Cached on globalThis so Next.js dev-mode hot reloading reuses the same
// client/connection pool instead of opening a new one on every file change.
export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
