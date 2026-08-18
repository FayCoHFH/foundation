import { randomBytes } from "node:crypto";

import { defineConfig, devices } from "@playwright/test";

import { assertDestructiveTestDatabaseSafety } from "./tests/support/destructive-test-database";

assertDestructiveTestDatabaseSafety();

const baseURL = "http://127.0.0.1:3100";
export const testAuthSecret =
  process.env.TEST_AUTH_SECRET ?? randomBytes(32).toString("base64url");
process.env.TEST_AUTH_SECRET = testAuthSecret;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  outputDir: "output/playwright",
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm exec next start --hostname 127.0.0.1 --port 3100",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      APP_ENV: "test",
      APP_BASE_URL: baseURL,
      BETTER_AUTH_URL: baseURL,
      ENABLE_TEST_AUTH: "true",
      TEST_AUTH_SECRET: testAuthSecret,
      GOOGLE_WORKSPACE_DOMAIN:
        process.env.GOOGLE_WORKSPACE_DOMAIN ?? "example.org",
    },
  },
});
