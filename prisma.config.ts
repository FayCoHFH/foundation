import { defineConfig } from "prisma/config";

import { loadEnvironmentFiles } from "./src/platform/config/load-environment-files";

loadEnvironmentFiles();

const requireDirectDatabaseUrl =
  process.env.PRISMA_REQUIRE_DIRECT_DATABASE_URL === "true";
const requireShadowDatabaseUrl =
  process.env.PRISMA_REQUIRE_SHADOW_DATABASE_URL === "true";
const directDatabaseUrl = process.env.DIRECT_DATABASE_URL;
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

if (requireDirectDatabaseUrl && !directDatabaseUrl) {
  throw new Error(
    "DIRECT_DATABASE_URL is required for Prisma migration commands.",
  );
}

if (requireShadowDatabaseUrl && !shadowDatabaseUrl) {
  throw new Error(
    "SHADOW_DATABASE_URL is required for Prisma migration drift checks.",
  );
}

function migrationTarget(url: string) {
  const parsed = new URL(url);
  const schemaValues = parsed.searchParams.getAll("schema");
  const schema = schemaValues.length === 1 ? schemaValues[0] : "public";
  const host = parsed.hostname === "localhost" ? "127.0.0.1" : parsed.hostname;

  return `${parsed.protocol}//${host.toLowerCase()}:${parsed.port || "5432"}${parsed.pathname}?schema=${schema}`;
}

if (
  directDatabaseUrl &&
  shadowDatabaseUrl &&
  migrationTarget(directDatabaseUrl) === migrationTarget(shadowDatabaseUrl)
) {
  throw new Error(
    "DIRECT_DATABASE_URL and SHADOW_DATABASE_URL must target separate databases.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations use an unpooled/direct connection. The application runtime
    // intentionally uses DATABASE_URL through the PostgreSQL driver adapter.
    url:
      directDatabaseUrl ??
      "postgresql://prisma-config.invalid/habitat_generation_only",
    ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}),
  },
});
