import { defineConfig } from "prisma/config";

import { loadEnvironmentFiles } from "./src/platform/config/load-environment-files";

loadEnvironmentFiles();

const requireDirectDatabaseUrl =
  process.env.PRISMA_REQUIRE_DIRECT_DATABASE_URL === "true";
const directDatabaseUrl = process.env.DIRECT_DATABASE_URL;
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

if (requireDirectDatabaseUrl && !directDatabaseUrl) {
  throw new Error(
    "DIRECT_DATABASE_URL is required for Prisma migration commands.",
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
