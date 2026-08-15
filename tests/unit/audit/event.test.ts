import { describe, expect, it } from "vitest";

import { buildAuditEvent } from "@/platform/audit/event";

describe("audit event builder", () => {
  it("creates bounded structured metadata without an admin actor for system events", () => {
    const event = buildAuditEvent({
      actorKind: "SYSTEM",
      action: "foundation.verify",
      targetType: "Foundation",
      targetId: "slice-1",
      summary: { result: "passed", attempts: 1 },
    });

    expect(event).toMatchObject({
      actorKind: "SYSTEM",
      action: "foundation.verify",
      targetId: "slice-1",
      outcome: "SUCCEEDED",
    });
    expect(event.actorAdminUserId).toBeUndefined();
    expect(event.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    "accessToken",
    "oauthClientSecretValue",
    "invitationTokenDigest",
    "authorization_header_value",
    "authHeaderValue",
    "session-cookie",
    "privateKeyMaterial",
    "signedDownloadUrl",
    "contactEmailAddress",
    "remoteIpAddress",
    "rawRequestBodyText",
  ])("rejects the sensitive summary key variant %s", (sensitiveKey) => {
    expect(() =>
      buildAuditEvent({
        actorKind: "SYSTEM",
        action: "foundation.reject",
        targetType: "Foundation",
        summary: { [sensitiveKey]: "must-not-appear" },
      }),
    ).toThrow(`Audit summary key is prohibited: ${sensitiveKey}`);
  });

  it("accepts the benign summary keys used by current audit events", () => {
    const summary = {
      attempts: 1,
      expiresAt: "2026-08-15T18:00:00.000Z",
      fixture: "platform-admin",
      freshAuthenticationRequired: true,
      grantId: "grant-1",
      invitationId: "invitation-1",
      provider: "google",
      reason: "A sufficiently specific operational reason",
      result: "passed",
      revokedAssignments: 2,
      revokedSessions: 3,
      roleCount: 2,
      roleKeys: ["platform-admin"],
      rolesRemainRevoked: true,
    } as const;

    const event = buildAuditEvent({
      actorKind: "SYSTEM",
      action: "foundation.verify",
      targetType: "Foundation",
      summary,
    });

    expect(event.summary).toEqual(summary);
  });

  it.each([
    "administrator@example.org",
    "203.0.113.42",
    "Bearer secret-value",
    "https://example.org/admin/invitations/accept?token=secret",
  ])("rejects a sensitive summary value %s", (sensitiveValue) => {
    expect(() =>
      buildAuditEvent({
        actorKind: "SYSTEM",
        action: "foundation.reject",
        targetType: "Foundation",
        summary: { detail: sensitiveValue },
      }),
    ).toThrow(/Audit summary value is prohibited/);
  });

  it("rejects oversized summaries", () => {
    expect(() =>
      buildAuditEvent({
        actorKind: "SYSTEM",
        action: "foundation.reject",
        targetType: "Foundation",
        summary: { detail: "x".repeat(9 * 1024) },
      }),
    ).toThrow(/8 KiB/);
  });
});
