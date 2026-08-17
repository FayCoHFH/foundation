import { describe, expect, it } from "vitest";

import { CAPABILITIES } from "@/platform/auth/capabilities";
import { ROLE_PRESETS } from "@/platform/auth/role-presets";

describe("capability catalog", () => {
  it("is stable and duplicate free", () => {
    expect(CAPABILITIES).toHaveLength(97);
    expect(new Set(CAPABILITIES).size).toBe(CAPABILITIES.length);
  });

  it("preserves the accepted 50-capability Communications catalog", () => {
    const communications = CAPABILITIES.filter(
      (capability) =>
        capability.startsWith("communications.") ||
        capability.startsWith("stories.") ||
        capability.startsWith("news.") ||
        capability.startsWith("newsletter.") ||
        capability.startsWith("media."),
    );
    expect(communications).toHaveLength(50);
  });

  it("does not put future sensitive capabilities in Super Admin", () => {
    const superAdmin = ROLE_PRESETS.find((role) => role.key === "super-admin");
    expect(superAdmin).toBeDefined();
    expect(superAdmin?.capabilities).not.toContain("applicants.export");
    expect(superAdmin?.capabilities).not.toContain("grants.private.read");
  });
});
