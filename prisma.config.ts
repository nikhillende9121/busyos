import path from "node:path";
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Read by the Prisma CLI only (migrate, studio, db pull/push) — NOT by the
// runtime PrismaClient, which connects through a driver adapter instead.
// See shared/database/prisma.ts and Docs/DATABASE.md -> Prisma 7 Driver Adapters.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
