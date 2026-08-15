const DISPOSABLE_DATABASE_NAME = /^habitat(?:_[a-z0-9]+)*_test$/;
const PRODUCTION_MARKER = /(^|[._-])(prod|production|live)([._-]|$)/i;
const TARGET_OVERRIDE_PARAMETERS = new Set([
  "database",
  "dbname",
  "host",
  "hostaddr",
  "port",
  "user",
  "username",
]);

export type DatabaseEnvironment = Readonly<{
  ALLOW_DESTRUCTIVE_TEST_DATABASE: string | undefined;
  DATABASE_URL: string | undefined;
  DIRECT_DATABASE_URL: string | undefined;
}>;

type ParsedDatabaseTarget = {
  databaseName: string;
  targetKey: string;
};

export type DestructiveTestDatabase = {
  databaseName: string;
  databaseUrl: string;
  directDatabaseUrl: string;
};

function fail(message: string): never {
  throw new Error(`Destructive test database guard refused to run: ${message}`);
}

function requiredValue(
  environment: DatabaseEnvironment,
  key: "DATABASE_URL" | "DIRECT_DATABASE_URL",
) {
  const value = environment[key];
  if (!value) fail(`${key} is required.`);
  if (value.trim() !== value) fail(`${key} is malformed.`);
  return value;
}

function decodedComponent(value: string, label: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return fail(`${label} is malformed.`);
  }
}

function parseDatabaseTarget(
  value: string,
  label: "DATABASE_URL" | "DIRECT_DATABASE_URL",
): ParsedDatabaseTarget {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return fail(`${label} must be a valid PostgreSQL URL.`);
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    fail(`${label} must use the postgres or postgresql protocol.`);
  }
  if (!parsed.hostname || parsed.hash) fail(`${label} is malformed.`);
  for (const key of parsed.searchParams.keys()) {
    if (TARGET_OVERRIDE_PARAMETERS.has(key.toLowerCase())) {
      fail(`${label} must not override database target fields in its query.`);
    }
  }

  const databaseName = decodedComponent(parsed.pathname.slice(1), label);
  if (!DISPOSABLE_DATABASE_NAME.test(databaseName)) {
    fail(
      `${label} database name must match ${DISPOSABLE_DATABASE_NAME.source}.`,
    );
  }

  const schemaValues = parsed.searchParams.getAll("schema");
  if (schemaValues.length > 1) fail(`${label} has an ambiguous schema.`);
  const schema = schemaValues[0] ?? "public";
  const username = decodedComponent(parsed.username, label);
  if (
    PRODUCTION_MARKER.test(parsed.hostname) ||
    PRODUCTION_MARKER.test(username) ||
    PRODUCTION_MARKER.test(databaseName) ||
    PRODUCTION_MARKER.test(schema)
  ) {
    fail(`${label} looks like a production or live database target.`);
  }

  return {
    databaseName,
    targetKey: `${parsed.hostname.toLowerCase()}:${parsed.port || "5432"}/${databaseName}?schema=${schema}`,
  };
}

export function assertDestructiveTestDatabaseSafety(
  environment?: DatabaseEnvironment,
): DestructiveTestDatabase {
  const selectedEnvironment = environment ?? {
    ALLOW_DESTRUCTIVE_TEST_DATABASE:
      process.env.ALLOW_DESTRUCTIVE_TEST_DATABASE,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL,
  };

  if (selectedEnvironment.ALLOW_DESTRUCTIVE_TEST_DATABASE !== "true") {
    fail("ALLOW_DESTRUCTIVE_TEST_DATABASE must equal true exactly.");
  }

  const databaseUrl = requiredValue(selectedEnvironment, "DATABASE_URL");
  const directDatabaseUrl = requiredValue(
    selectedEnvironment,
    "DIRECT_DATABASE_URL",
  );
  const runtimeTarget = parseDatabaseTarget(databaseUrl, "DATABASE_URL");
  const directTarget = parseDatabaseTarget(
    directDatabaseUrl,
    "DIRECT_DATABASE_URL",
  );

  if (runtimeTarget.targetKey !== directTarget.targetKey) {
    fail(
      "DATABASE_URL and DIRECT_DATABASE_URL must identify the same host, port, database, and schema.",
    );
  }

  return Object.freeze({
    databaseName: runtimeTarget.databaseName,
    databaseUrl,
    directDatabaseUrl,
  });
}
