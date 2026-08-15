import { describe, expect, it } from "vitest";

import {
  assertDestructiveTestDatabaseSafety,
  type DatabaseEnvironment,
} from "../../support/destructive-test-database";

const databaseUrl =
  "postgresql://habitat_test:fixture@127.0.0.1:5432/habitat_identity_test?schema=public";

function environment(
  overrides: Partial<DatabaseEnvironment> = {},
): DatabaseEnvironment {
  return {
    ALLOW_DESTRUCTIVE_TEST_DATABASE: "true",
    DATABASE_URL: databaseUrl,
    DIRECT_DATABASE_URL: databaseUrl,
    ...overrides,
  };
}

describe("destructive test database guard", () => {
  it("accepts an explicit opt-in and matching disposable PostgreSQL targets", () => {
    expect(assertDestructiveTestDatabaseSafety(environment())).toMatchObject({
      databaseName: "habitat_identity_test",
      databaseUrl,
      directDatabaseUrl: databaseUrl,
    });
  });

  it.each([undefined, "", "false", "TRUE", " true "])(
    "rejects a missing or inexact destructive opt-in (%s)",
    (optIn) => {
      expect(() =>
        assertDestructiveTestDatabaseSafety(
          environment({ ALLOW_DESTRUCTIVE_TEST_DATABASE: optIn }),
        ),
      ).toThrow(/must equal true exactly/);
    },
  );

  it.each([
    "not a URL",
    "mysql://habitat_test:fixture@127.0.0.1:3306/habitat_test",
    "postgresql://habitat_test:fixture@127.0.0.1:5432/habitat",
    "postgresql://habitat_test:fixture@127.0.0.1:5432/habitat_prod_test",
    "postgresql://habitat_test:fixture@prod-db.example.org:5432/habitat_test",
    "postgresql://production_user:fixture@127.0.0.1:5432/habitat_test",
    "postgresql://habitat_test:fixture@127.0.0.1:5432/habitat_test?schema=production",
    "postgresql://habitat_test:fixture@127.0.0.1:5432/habitat_test?host=prod-db.example.org",
  ])("rejects malformed, non-Postgres, or production-looking URL %s", (url) => {
    expect(() =>
      assertDestructiveTestDatabaseSafety(environment({ DATABASE_URL: url })),
    ).toThrow(/guard refused to run/);
  });

  it("rejects runtime and direct URLs that do not identify the same database target", () => {
    expect(() =>
      assertDestructiveTestDatabaseSafety(
        environment({
          DIRECT_DATABASE_URL:
            "postgresql://habitat_test:fixture@127.0.0.1:5432/habitat_other_test?schema=public",
        }),
      ),
    ).toThrow(/must identify the same host, port, database, and schema/);
  });
});
