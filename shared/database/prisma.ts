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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function createPrismaClient(): PrismaClient {
  // Discrete fields instead of a DATABASE_URL string: the password is used
  // raw here, so it never needs URL percent-encoding (a recurring source of
  // broken connection strings when the password contains @).
  const adapter = new PrismaMariaDb({
    host: requireEnv("DB_HOST"),
    port: Number(process.env.DB_PORT ?? 3306),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    database: requireEnv("DB_NAME"),
    allowPublicKeyRetrieval: true,
    connectionLimit: Number(process.env.DB_POOL_LIMIT ?? 25),
    connectTimeout: 30000,
    acquireTimeout: 30000,
    idleTimeout: 60000,
    keepAliveDelay: 10000,
  });
  return new PrismaClient({ adapter });
}

// Cached on globalThis so Next.js dev-mode hot reloading reuses the same
// client/connection pool instead of opening a new one on every file change.
export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
