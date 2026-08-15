import { describe, it } from "vitest";

if (process.env.C42B_RUN_MIGRATION_UPGRADE === "true") {
  await import("../migrations/c3-to-c4-featured-news-upgrade.test");
} else {
  describe.skip("C3-to-current migration upgrade", () => {
    it("runs only when explicitly enabled by the focused migration command", () => {});
  });
}
