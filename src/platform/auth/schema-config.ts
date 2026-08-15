import { PrismaPg } from "@prisma/adapter-pg";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";

import { PrismaClient } from "@/generated/prisma/client";
import { AUTH_SCHEMA_OPTIONS } from "@/platform/auth/schema-options";
import { readServerEnvironment } from "@/platform/config/environment";
import { loadEnvironmentFiles } from "@/platform/config/load-environment-files";

// CLI-only configuration used by `pnpm auth:schema:generate`. Better Auth's
// CLI refuses server-only module markers, so this intentionally carries only
// the shared schema-affecting options and a non-connecting Prisma instance.
loadEnvironmentFiles();
const environment = readServerEnvironment();
const adapter = new PrismaPg({ connectionString: environment.databaseUrl });
const schemaPrisma = new PrismaClient({ adapter });

export const auth = betterAuth({
  baseURL: environment.appBaseUrl,
  database: prismaAdapter(schemaPrisma, {
    provider: "postgresql",
    transaction: true,
  }),
  ...AUTH_SCHEMA_OPTIONS,
});
