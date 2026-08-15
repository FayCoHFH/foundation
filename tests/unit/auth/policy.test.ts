import { describe, expect, it } from "vitest";

import {
  assertFreshAuthentication,
  FRESH_AUTH_MAX_AGE_SECONDS,
  safeAdminNextPath,
  SESSION_MAX_AGE_SECONDS,
} from "@/platform/auth/policy";

describe("auth policy", () => {
  it("keeps the accepted fixed session and freshness windows", () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(43_200);
    expect(FRESH_AUTH_MAX_AGE_SECONDS).toBe(300);
  });

  it("requires a genuinely recent session for sensitive actions", () => {
    const now = new Date("2026-08-14T12:05:00.000Z");
    expect(() =>
      assertFreshAuthentication(
        { sessionCreatedAt: new Date("2026-08-14T12:00:01.000Z") },
        now,
      ),
    ).not.toThrow();
    expect(() =>
      assertFreshAuthentication(
        { sessionCreatedAt: new Date("2026-08-14T11:59:59.000Z") },
        now,
      ),
    ).toThrow(/recent Google sign-in/);
  });

  it("allows only local administration callback paths", () => {
    expect(safeAdminNextPath("/admin/invitations/new?from=test")).toBe(
      "/admin/invitations/new?from=test",
    );
    expect(safeAdminNextPath("https://attacker.example/admin")).toBe("/admin");
    expect(safeAdminNextPath("//attacker.example/admin")).toBe("/admin");
    expect(safeAdminNextPath("/admin\\..\\outside")).toBe("/admin");
  });
});
