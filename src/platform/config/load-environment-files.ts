import { resolve } from "node:path";

import { config } from "dotenv";

/**
 * Load operator-facing environment files with Next-compatible precedence.
 * Existing process variables win, followed by .env.local, then .env.
 */
export function loadEnvironmentFiles(directory = process.cwd()) {
  return config({
    path: [resolve(directory, ".env.local"), resolve(directory, ".env")],
    override: false,
    quiet: true,
  });
}
