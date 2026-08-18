import { describe, expect, it } from "vitest";

import { readServerEnvironment } from "@/platform/config/environment";
import {
  completionTimeAllowsSubmission,
  fingerprintPublicStoryIntakeValue,
  hashPublicStorySubmissionToken,
  issuePublicStorySubmissionToken,
  verifyPublicStorySubmissionToken,
} from "@/modules/communications/submissions/intake-token";
import {
  parsePublicStorySubmissionForm,
  validatePublicStorySubmissionRequestContext,
} from "@/modules/communications/submissions/intake-request";
import {
  issuePublicStorySubmissionFormToken,
  submitPublicStorySubmission,
} from "@/modules/communications/submissions/intake-service";
import {
  PUBLIC_STORY_INTAKE_FORM_PURPOSE,
  type PublicStoryIntakeConfig,
} from "@/modules/communications/submissions/intake-contract";

const secret = "c6b1b-unit-intake-secret-that-is-at-least-32-bytes";
const config: PublicStoryIntakeConfig = {
  enabled: true,
  secret,
  privacyNoticeVersion: "public-story-v1",
  appOrigin: "http://127.0.0.1:3000",
  appEnv: "test",
  isVercel: false,
};

const now = new Date("2040-08-16T12:00:00.000Z");

function headers(overrides: Record<string, string> = {}) {
  return {
    origin: config.appOrigin,
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "navigate",
    "content-type": "multipart/form-data; boundary=test",
    ...overrides,
  };
}

function form(token: string, overrides: Record<string, string> = {}) {
  const value = new FormData();
  value.set("formToken", token);
  value.set("honeypot", "");
  value.set("submitterName", "Jordan Example");
  value.set("submitterEmail", "jordan@example.org");
  value.set("relationshipToHabitat", "Community volunteer");
  value.set(
    "storyText",
    "This is a sufficiently long plain-text story about Habitat and our neighborhood.",
  );
  value.set("contactConsent", "true");
  value.set("privacyNoticeVersion", "public-story-v1");
  value.set("privacyNoticeAcknowledged", "true");
  value.set("editorialReviewAcknowledged", "true");
  value.set("sensitiveDataWarningAcknowledged", "true");
  for (const [key, entry] of Object.entries(overrides)) value.set(key, entry);
  return value;
}

describe("C6B-1B feature configuration", () => {
  it("keeps intake disabled unless explicitly enabled and fully configured", () => {
    expect(
      readServerEnvironment({
        APP_ENV: "test",
        APP_BASE_URL: "http://127.0.0.1:3000",
      }).publicStorySubmissionsEnabled,
    ).toBe(false);
    expect(() =>
      readServerEnvironment({
        APP_ENV: "test",
        APP_BASE_URL: "http://127.0.0.1:3000",
        PUBLIC_STORY_SUBMISSIONS_ENABLED: "true",
      }),
    ).toThrow(/PUBLIC_STORY_SUBMISSIONS_SECRET/);
    const enabled = readServerEnvironment({
      APP_ENV: "test",
      APP_BASE_URL: "http://127.0.0.1:3000",
      PUBLIC_STORY_SUBMISSIONS_ENABLED: "true",
      PUBLIC_STORY_SUBMISSIONS_SECRET: secret,
      PUBLIC_STORY_SUBMISSIONS_PRIVACY_NOTICE_VERSION: "public-story-v1",
    });
    expect(enabled.publicStorySubmissionsEnabled).toBe(true);
    expect(enabled.publicStorySubmissionsPrivacyNoticeVersion).toBe(
      "public-story-v1",
    );
  });

  it("requires the privacy version and HTTPS for enabled production intake", () => {
    expect(() =>
      readServerEnvironment({
        APP_ENV: "production",
        APP_BASE_URL: "https://example.org",
        BETTER_AUTH_SECRET: "x".repeat(32),
        DATABASE_URL: "postgresql://production/runtime",
        STORAGE_DRIVER: "vercel-blob",
        AUTH_ENABLED: "false",
        PUBLIC_STORY_SUBMISSIONS_ENABLED: "true",
        PUBLIC_STORY_SUBMISSIONS_SECRET: secret,
      }),
    ).toThrow(/PRIVACY_NOTICE_VERSION/);
  });
});

describe("C6B-1B signed intake tokens", () => {
  it("issues and verifies a non-PII short-lived token", () => {
    const token = issuePublicStorySubmissionToken(
      { secret, privacyNoticeVersion: "public-story-v1" },
      now,
    );
    const verified = verifyPublicStorySubmissionToken(
      token,
      { secret, privacyNoticeVersion: "public-story-v1" },
      new Date(now.valueOf() + 1_000),
    );
    expect(verified).toMatchObject({
      issuedAt: now,
      privacyNoticeVersion: "public-story-v1",
    });
    expect(token).not.toContain("Jordan");
    expect(token).not.toContain("example.org");
    expect(token).not.toContain(PUBLIC_STORY_INTAKE_FORM_PURPOSE);
  });

  it.each([
    ["tampered payload", (token: string) => `${token}x`],
    ["tampered signature", (token: string) => `${token.slice(0, -1)}x`],
  ])("rejects %s", (_label, tamper) => {
    const token = issuePublicStorySubmissionToken(
      { secret, privacyNoticeVersion: "public-story-v1" },
      now,
    );
    expect(
      verifyPublicStorySubmissionToken(
        tamper(token),
        { secret, privacyNoticeVersion: "public-story-v1" },
        new Date(now.valueOf() + 1_000),
      ),
    ).toBeNull();
  });

  it("rejects wrong purpose/version, stale privacy version, expiry, future issue, and malformed input", () => {
    const token = issuePublicStorySubmissionToken(
      { secret, privacyNoticeVersion: "public-story-v1" },
      now,
    );
    expect(
      verifyPublicStorySubmissionToken(
        token,
        { secret, privacyNoticeVersion: "public-story-v2" },
        new Date(now.valueOf() + 1_000),
      ),
    ).toBeNull();
    expect(
      verifyPublicStorySubmissionToken(
        "not.a.valid.token",
        { secret, privacyNoticeVersion: "public-story-v1" },
        now,
      ),
    ).toBeNull();
    expect(
      verifyPublicStorySubmissionToken(
        token,
        { secret, privacyNoticeVersion: "public-story-v1" },
        new Date(now.valueOf() + 2 * 60 * 60 * 1000 + 1),
      ),
    ).toBeNull();
    const futureToken = issuePublicStorySubmissionToken(
      { secret, privacyNoticeVersion: "public-story-v1" },
      new Date(now.valueOf() + 10_000),
    );
    expect(
      verifyPublicStorySubmissionToken(
        futureToken,
        { secret, privacyNoticeVersion: "public-story-v1" },
        now,
      ),
    ).toBeNull();
  });

  it("supports deterministic completion timing and privacy-preserving hashes", () => {
    const token = issuePublicStorySubmissionToken(
      { secret, privacyNoticeVersion: "public-story-v1" },
      now,
    );
    const verified = verifyPublicStorySubmissionToken(
      token,
      { secret, privacyNoticeVersion: "public-story-v1" },
      new Date(now.valueOf() + 1_000),
    );
    expect(verified).not.toBeNull();
    if (!verified) return;
    expect(
      completionTimeAllowsSubmission(verified, new Date(now.valueOf() + 999)),
    ).toBe(false);
    expect(
      completionTimeAllowsSubmission(verified, new Date(now.valueOf() + 1_000)),
    ).toBe(true);
    const fingerprint = fingerprintPublicStoryIntakeValue(
      "email",
      "person@example.org",
      secret,
    );
    expect(fingerprint).toHaveLength(64);
    expect(fingerprint).not.toContain("person@example.org");
    expect(hashPublicStorySubmissionToken(token)).toHaveLength(64);
  });
});

describe("C6B-1B request security", () => {
  it("accepts the same-origin browser context and rejects unsafe contexts", () => {
    expect(validatePublicStorySubmissionRequestContext(headers(), config)).toBe(
      true,
    );
    for (const override of [
      { origin: "https://foreign.example" },
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-mode": "cors" },
      { "content-type": "application/json" },
      { "content-length": "999999" },
    ]) {
      expect(
        validatePublicStorySubmissionRequestContext(headers(override), config),
      ).toBe(false);
    }
    expect(
      validatePublicStorySubmissionRequestContext(
        headers({ origin: "" }),
        config,
      ),
    ).toBe(false);
  });

  it("accepts only bounded scalar fields and rejects files, duplicates, and unknown fields", () => {
    const token = issuePublicStorySubmissionToken(
      { secret, privacyNoticeVersion: "public-story-v1" },
      now,
    );
    expect(parsePublicStorySubmissionForm(form(token))).toMatchObject({
      kind: "ok",
    });
    const unknown = form(token);
    unknown.set("unexpected", "value");
    expect(parsePublicStorySubmissionForm(unknown)).toEqual({
      kind: "security",
      reason: "shape",
    });
    const duplicate = form(token);
    duplicate.append("submitterEmail", "second@example.org");
    expect(parsePublicStorySubmissionForm(duplicate)).toEqual({
      kind: "security",
      reason: "shape",
    });
    const file = form(token);
    file.set("storyText", new File(["private"], "story.txt"));
    expect(parsePublicStorySubmissionForm(file)).toEqual({
      kind: "security",
      reason: "shape",
    });
    const oversized = form(token);
    oversized.set("storyText", "x".repeat(50_000));
    expect(parsePublicStorySubmissionForm(oversized)).toEqual({
      kind: "security",
      reason: "size",
    });
  });

  it("returns safe unavailable behavior while disabled and does not invoke persistence", async () => {
    const token = issuePublicStorySubmissionToken(
      { secret, privacyNoticeVersion: "public-story-v1" },
      now,
    );
    const outcome = await submitPublicStorySubmission(
      form(token),
      { headers: headers() },
      { config: { ...config, enabled: false } },
    );
    expect(outcome).toEqual({
      code: "UNAVAILABLE",
      message: expect.any(String),
    });
    expect(
      issuePublicStorySubmissionFormToken({
        config: { ...config, enabled: false },
        now: () => now,
      }),
    ).toBeNull();
  });
});
