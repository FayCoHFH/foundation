import {
  assertDestructiveTestDatabaseSafety,
  type DatabaseEnvironment,
} from "./destructive-test-database";

type MigrationEnvironment = DatabaseEnvironment & {
  SHADOW_DATABASE_URL: string | undefined;
};

const TARGET_OVERRIDE_PARAMETERS = new Set([
  "database",
  "dbname",
  "host",
  "hostaddr",
  "port",
  "user",
  "username",
]);

function shadowTarget(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(
      "Prisma migration shadow database guard refused to run: SHADOW_DATABASE_URL must be a PostgreSQL URL.",
    );
  }
  if (
    !parsed.hostname ||
    !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
  ) {
    throw new Error(
      "Prisma migration shadow database guard refused to run: SHADOW_DATABASE_URL must target loopback PostgreSQL.",
    );
  }
  for (const key of parsed.searchParams.keys()) {
    if (TARGET_OVERRIDE_PARAMETERS.has(key.toLowerCase())) {
      throw new Error(
        "Prisma migration shadow database guard refused to run: SHADOW_DATABASE_URL must not override database target fields in its query.",
      );
    }
  }

  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!/^habitat(?:_[a-z0-9]+)*_test$/.test(databaseName)) {
    throw new Error(
      "Prisma migration shadow database guard refused to run: SHADOW_DATABASE_URL must name a disposable habitat*_test database.",
    );
  }

  const schemaValues = parsed.searchParams.getAll("schema");
  if (schemaValues.length > 1) {
    throw new Error(
      "Prisma migration shadow database guard refused to run: SHADOW_DATABASE_URL has an ambiguous schema.",
    );
  }

  return `${parsed.hostname.toLowerCase()}:${parsed.port || "5432"}/${databaseName}?schema=${schemaValues[0] ?? "public"}`;
}

function assertLoopbackDirectTarget(value: string) {
  const parsed = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error(
      "Prisma migration shadow database guard refused to run: DIRECT_DATABASE_URL must target loopback PostgreSQL.",
    );
  }
}

const environment: MigrationEnvironment = {
  ALLOW_DESTRUCTIVE_TEST_DATABASE: process.env.ALLOW_DESTRUCTIVE_TEST_DATABASE,
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL,
  SHADOW_DATABASE_URL: process.env.SHADOW_DATABASE_URL,
};
const database = assertDestructiveTestDatabaseSafety(environment);
assertLoopbackDirectTarget(database.directDatabaseUrl);

if (!environment.SHADOW_DATABASE_URL) {
  throw new Error(
    "Prisma migration shadow database guard refused to run: SHADOW_DATABASE_URL is required.",
  );
}

if (
  shadowTarget(environment.SHADOW_DATABASE_URL) ===
  shadowTarget(database.directDatabaseUrl)
) {
  throw new Error(
    "Prisma migration shadow database guard refused to run: SHADOW_DATABASE_URL must differ from DIRECT_DATABASE_URL.",
  );
}

console.log(
  `Validated disposable Prisma migration target ${database.databaseName} and separate shadow database.`,
);
