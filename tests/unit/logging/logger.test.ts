import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/platform/logging/logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("structured logger redaction", () => {
  it("recursively redacts secret material, PII, and private URLs", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.error("redaction.boundary.verify", {
      correlationId: "request-123",
      operation: "redaction.verify",
      roleKeys: ["platform-admin"],
      freshAuthenticationRequired: true,
      invitationId: "invitation-1",
      nested: {
        oauthClientSecretValue: "oauth-secret-value",
        authHeaderValue: "auth-header-value",
        invitationTokenDigest: "invitation-token-digest",
        contact_email_address: "person@example.org",
        remoteIpAddress: "203.0.113.42",
        privateKeyMaterial: "private-key-value",
        entries: [
          {
            phoneNumber: "+1-555-0100",
            invitation_url:
              "https://example.org/admin/invitations/accept?token=invite-secret",
          },
          ["nested-person@example.org", "198.51.100.14"],
          {
            download:
              "https://storage.example.org/object?X-Amz-Signature=signed-secret",
            publicUrl: "https://example.org/news/community-update",
          },
        ],
      },
    });

    expect(write).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(write.mock.calls[0]?.[0])) as Record<
      string,
      unknown
    >;
    const serialized = JSON.stringify(payload);

    expect(payload).toMatchObject({
      level: "error",
      event: "redaction.boundary.verify",
      correlationId: "request-123",
      operation: "redaction.verify",
      roleKeys: ["platform-admin"],
      freshAuthenticationRequired: true,
      invitationId: "invitation-1",
      nested: {
        oauthClientSecretValue: "[REDACTED]",
        authHeaderValue: "[REDACTED]",
        invitationTokenDigest: "[REDACTED]",
        contact_email_address: "[REDACTED]",
        remoteIpAddress: "[REDACTED]",
        privateKeyMaterial: "[REDACTED]",
        entries: [
          {
            phoneNumber: "[REDACTED]",
            invitation_url: "[REDACTED]",
          },
          ["[REDACTED]", "[REDACTED]"],
          {
            download: "[REDACTED]",
            publicUrl: "https://example.org/news/community-update",
          },
        ],
      },
    });
    expect(payload.timestamp).toEqual(expect.any(String));
    expect(serialized).not.toContain("oauth-secret-value");
    expect(serialized).not.toContain("auth-header-value");
    expect(serialized).not.toContain("invitation-token-digest");
    expect(serialized).not.toContain("person@example.org");
    expect(serialized).not.toContain("203.0.113.42");
    expect(serialized).not.toContain("invite-secret");
    expect(serialized).not.toContain("signed-secret");
    expect(serialized).not.toContain("nested-person@example.org");
    expect(serialized).not.toContain("198.51.100.14");
  });

  it("redacts bearer values and prevents context from replacing the envelope", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.error("redaction.envelope.verify", {
      event: "https://example.org/invitations/accept?token=event-secret",
      level: "debug",
      timestamp: "spoofed-timestamp",
      nested: ["Bearer bearer-secret"],
    });

    const payload = JSON.parse(String(write.mock.calls[0]?.[0])) as Record<
      string,
      unknown
    >;
    const serialized = JSON.stringify(payload);

    expect(payload.event).toBe("redaction.envelope.verify");
    expect(payload.level).toBe("error");
    expect(payload.timestamp).not.toBe("spoofed-timestamp");
    expect(payload.nested).toEqual(["[REDACTED]"]);
    expect(serialized).not.toContain("event-secret");
    expect(serialized).not.toContain("bearer-secret");
  });

  it("redacts confidential public-story submission fields by name", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.error("public_story_submission.test", {
      submitterEmail: "person@example.org",
      storyText: "private story text",
      internalReviewNote: "private review note",
      relationshipToHabitat: "private relationship",
    });

    const serialized = String(write.mock.calls[0]?.[0]);
    expect(serialized).not.toContain("private story text");
    expect(serialized).not.toContain("private review note");
    expect(serialized).not.toContain("private relationship");
    expect(serialized).toContain('"storyText":"[REDACTED]"');
    expect(serialized).toContain('"internalReviewNote":"[REDACTED]"');
  });
});
