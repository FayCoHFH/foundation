import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/helpers/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    env: {
      APP_ENV: "test",
      APP_BASE_URL: "http://127.0.0.1:3000",
      BETTER_AUTH_SECRET: "unit-test-secret-that-is-at-least-32-characters",
      GOOGLE_WORKSPACE_DOMAIN: "example.org",
    },
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    exclude: ["tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/generated/**", "**/*.d.ts"],
    },
  },
});
