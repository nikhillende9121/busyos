import "dotenv/config";
import { prisma } from "../shared/database/prisma";

async function main() {
  console.log("Testing DB connection...");
  const start = Date.now();
  const count = await prisma.user.count();
  console.log(`Connected! User count: ${count} in ${Date.now() - start}ms`);
}

main().catch((err) => {
  console.error("DB Connection Failed:", err);
  process.exit(1);
});
