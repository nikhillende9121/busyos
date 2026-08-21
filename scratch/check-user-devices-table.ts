import "dotenv/config";
import { prisma } from "@/shared/database/prisma";

async function main() {
  const tables = await prisma.$queryRaw<any[]>`SHOW TABLES LIKE 'user_devices'`;
  console.log("Tables matching user_devices:", tables);

  if (tables.length > 0) {
    const columns = await prisma.$queryRaw<any[]>`DESCRIBE user_devices`;
    console.log("Columns in user_devices:", columns);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
