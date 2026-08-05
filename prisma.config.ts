import path from "node:path";
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Read by the Prisma CLI only (migrate, studio, db pull/push) — NOT by the
// runtime PrismaClient, which connects through a driver adapter instead.
// See shared/database/prisma.ts and Docs/DATABASE.md -> Prisma 7 Driver Adapters.
//
// Built from the same discrete DB_* fields the runtime client uses, with the
// password percent-encoded here in code — never by hand in .env — since a
// raw "@" in a hand-typed connection string is exactly what kept breaking.
const databaseUrl = `mysql://${env("DB_USER")}:${encodeURIComponent(env("DB_PASSWORD"))}@${env("DB_HOST")}:${env("DB_PORT") ?? "3306"}/${env("DB_NAME")}?allowPublicKeyRetrieval=true`;

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: databaseUrl,
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
