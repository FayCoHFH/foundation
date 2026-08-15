import { describe, expect, it } from "vitest";

import {
  createInvitationProof,
  digestInvitationToken,
  verifyInvitationProof,
} from "@/platform/auth/invitation-proof";

describe("invitation proof", () => {
  it("round-trips only inside its short lifetime", () => {
    const now = new Date("2026-08-14T12:00:00.000Z");
    const proof = createInvitationProof("A".repeat(43), now);

    expect(verifyInvitationProof(proof, now)?.invitationToken).toBe(
      "A".repeat(43),
    );
    expect(
      verifyInvitationProof(proof, new Date("2026-08-14T12:10:01.000Z")),
    ).toBeNull();
  });

  it("rejects tampering", () => {
    const proof = createInvitationProof("B".repeat(43));
    expect(verifyInvitationProof(`${proof.slice(0, -1)}x`)).toBeNull();
  });

  it("stores a fixed lowercase digest instead of a raw token", () => {
    expect(digestInvitationToken("secret-token")).toMatch(/^[0-9a-f]{64}$/);
    expect(digestInvitationToken("secret-token")).not.toContain("secret-token");
  });
});
