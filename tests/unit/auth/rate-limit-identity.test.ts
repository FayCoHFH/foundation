import { describe, expect, it } from "vitest";

import {
  RATE_LIMIT_IDENTITY_HEADER,
  withPseudonymousRateLimitHeaders,
  withPseudonymousRateLimitIdentity,
} from "@/platform/auth/rate-limit-identity";

const secret = "rate-limit-test-secret-that-is-at-least-32-characters";

describe("rate-limit request identity", () => {
  it("replaces Vercel's overwritten client address with a stable keyed pseudonym", () => {
    const request = new Request("https://example.org/api/auth/sign-in/social", {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.42",
        [RATE_LIMIT_IDENTITY_HEADER]: "spoofed",
      },
    });
    const first = withPseudonymousRateLimitIdentity(request, {
      authSecret: secret,
      isVercel: true,
    });
    const second = withPseudonymousRateLimitIdentity(request, {
      authSecret: secret,
      isVercel: true,
    });
    const pseudonym = first.headers.get(RATE_LIMIT_IDENTITY_HEADER);

    expect(pseudonym).toMatch(/^(?:[a-f0-9]{4}:){7}[a-f0-9]{4}$/);
    expect(pseudonym).not.toContain("203.0.113.42");
    expect(second.headers.get(RATE_LIMIT_IDENTITY_HEADER)).toBe(pseudonym);
  });

  it("removes a caller-supplied internal header outside Vercel", () => {
    const request = new Request("http://localhost:3000/api/auth/sign-in", {
      headers: { [RATE_LIMIT_IDENTITY_HEADER]: "2001:db8::1" },
    });
    const prepared = withPseudonymousRateLimitIdentity(request, {
      authSecret: secret,
      isVercel: false,
    });

    expect(prepared.headers.has(RATE_LIMIT_IDENTITY_HEADER)).toBe(false);
  });

  it("prepares direct Better Auth API headers with the same Vercel pseudonym", () => {
    const headers = withPseudonymousRateLimitHeaders(
      new Headers({ "x-vercel-forwarded-for": "198.51.100.12" }),
      { authSecret: secret, isVercel: true },
    );

    expect(headers.get(RATE_LIMIT_IDENTITY_HEADER)).toMatch(
      /^(?:[a-f0-9]{4}:){7}[a-f0-9]{4}$/,
    );
    expect(headers.get(RATE_LIMIT_IDENTITY_HEADER)).not.toContain(
      "198.51.100.12",
    );
  });
});
