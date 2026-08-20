import { describe, expect, it } from "vitest";

import { normalizePostgresTlsVerification } from "@/platform/database/connection-string";

describe("PostgreSQL TLS connection normalization", () => {
  it.each(["prefer", "require", "verify-ca"])(
    "upgrades sslmode=%s to explicit certificate verification",
    (sslMode) => {
      const result = normalizePostgresTlsVerification(
        `postgresql://user:pass@database.example:5432/habitat?sslmode=${sslMode}&channel_binding=require`,
      );
      const parsed = new URL(result);

      expect(parsed.searchParams.get("sslmode")).toBe("verify-full");
      expect(parsed.searchParams.get("channel_binding")).toBe("require");
      expect(parsed.hostname).toBe("database.example");
      expect(parsed.pathname).toBe("/habitat");
    },
  );

  it.each([
    "postgresql://user:pass@database.example/habitat?sslmode=verify-full",
    "postgresql://user:pass@database.example/habitat?sslmode=disable",
    "postgresql://user:pass@database.example/habitat",
    "https://database.example/habitat?sslmode=require",
    "not-a-url",
  ])("does not rewrite an unrelated or already explicit URL", (value) => {
    expect(normalizePostgresTlsVerification(value)).toBe(value);
  });
});
