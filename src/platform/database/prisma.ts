import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { readServerEnvironment } from "@/platform/config/environment";

const globalForPrisma = globalThis as unknown as {
  habitatPrisma?: PrismaClient;
};

function createPrismaClient() {
  const environment = readServerEnvironment();
  const adapter = new PrismaPg({ connectionString: environment.databaseUrl });
  return new PrismaClient({
    adapter,
    log: environment.appEnv === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.habitatPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.habitatPrisma = prisma;
}
