import "dotenv/config";
import { prisma } from "@/shared/database/prisma";

// Run: npx tsx prisma/test-connection.ts
// Checks that DATABASE_URL in .env (or the shell env) actually connects.
async function main() {
  const start = Date.now();
  const rows = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
  const ms = Date.now() - start;

  console.log("Connected OK in", ms, "ms");
  console.log("Query result:", rows);

  const [{ version }] = await prisma.$queryRaw<{ version: string }[]>`SELECT VERSION() AS version`;
  console.log("Server version:", version);
}

main()
  .catch((err) => {
    console.error("Connection failed:");
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
