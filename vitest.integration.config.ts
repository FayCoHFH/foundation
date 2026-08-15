import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["react-server"],
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
      BETTER_AUTH_URL: "http://127.0.0.1:3000",
      BETTER_AUTH_SECRET:
        "integration-test-secret-that-is-at-least-32-characters",
      GOOGLE_WORKSPACE_DOMAIN: "example.org",
    },
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
