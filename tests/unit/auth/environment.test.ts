import { describe, expect, it } from "vitest";

import { readServerEnvironment } from "@/platform/config/environment";

describe("environment safety", () => {
  it("keeps preview authentication off unless explicitly configured", () => {
    const environment = readServerEnvironment({
      APP_ENV: "preview",
      APP_BASE_URL: "https://preview.example.org",
      BETTER_AUTH_SECRET: "x".repeat(32),
      DATABASE_URL: "postgresql://preview/runtime",
      DIRECT_DATABASE_URL: "postgresql://preview/direct",
      STORAGE_DRIVER: "vercel-blob",
    });
    expect(environment.authEnabled).toBe(false);
  });

  it("fails closed when production secrets and databases are absent", () => {
    expect(() =>
      readServerEnvironment({
        APP_ENV: "production",
        APP_BASE_URL: "https://example.org",
        STORAGE_DRIVER: "vercel-blob",
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("rejects test authentication in a deployment runtime", () => {
    expect(() =>
      readServerEnvironment({
        APP_ENV: "preview",
        APP_BASE_URL: "https://preview.example.org",
        BETTER_AUTH_SECRET: "x".repeat(32),
        DATABASE_URL: "postgresql://preview/runtime",
        DIRECT_DATABASE_URL: "postgresql://preview/direct",
        STORAGE_DRIVER: "vercel-blob",
        ENABLE_TEST_AUTH: "true",
        TEST_AUTH_SECRET: "y".repeat(32),
        VERCEL: "1",
      }),
    ).toThrow(/permitted only/);
  });

  it("rejects trusted-origin entries that contain a path", () => {
    expect(() =>
      readServerEnvironment({
        APP_ENV: "development",
        APP_BASE_URL: "http://localhost:3000",
        AUTH_TRUSTED_ORIGINS: "https://example.org/a-path",
      }),
    ).toThrow(/exact HTTP\(S\) origins/);
  });

  it("rejects wildcard and credential-bearing trusted origins", () => {
    for (const origin of [
      "https://*.vercel.app",
      "https://operator:secret@example.org",
      "ftp://example.org",
    ]) {
      expect(() =>
        readServerEnvironment({
          APP_ENV: "development",
          APP_BASE_URL: "http://localhost:3000",
          AUTH_TRUSTED_ORIGINS: origin,
        }),
      ).toThrow(/exact HTTP\(S\) origins/);
    }
  });

  it("rejects a path, query, or wildcard in the application origin", () => {
    for (const appBaseUrl of [
      "https://example.org/admin",
      "https://example.org?preview=true",
      "https://*.example.org",
    ]) {
      expect(() =>
        readServerEnvironment({
          APP_ENV: "development",
          APP_BASE_URL: appBaseUrl,
        }),
      ).toThrow(/APP_BASE_URL must contain exact HTTP\(S\) origins/);
    }
  });

  it("requires an explicit runtime classification", () => {
    expect(() =>
      readServerEnvironment({ APP_BASE_URL: "http://localhost:3000" }),
    ).toThrow(/APP_ENV/);
  });

  it("rejects a callback origin outside the single-origin application", () => {
    expect(() =>
      readServerEnvironment({
        APP_ENV: "production",
        APP_BASE_URL: "https://www.example.org",
        BETTER_AUTH_URL: "http://localhost:3000",
        BETTER_AUTH_SECRET: "x".repeat(32),
        DATABASE_URL: "postgresql://production/runtime",
        STORAGE_DRIVER: "vercel-blob",
      }),
    ).toThrow(/BETTER_AUTH_URL must equal APP_BASE_URL/);
  });

  it("rejects a Vercel environment classification mismatch", () => {
    expect(() =>
      readServerEnvironment({
        APP_ENV: "development",
        APP_BASE_URL: "https://preview.example.org",
        NODE_ENV: "production",
        VERCEL: "1",
        VERCEL_ENV: "preview",
      }),
    ).toThrow(/must match VERCEL_ENV/);
  });
});
