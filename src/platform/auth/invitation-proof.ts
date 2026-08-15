import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { readServerEnvironment } from "@/platform/config/environment";

export const INVITATION_PROOF_COOKIE = "fchh.invitation_acceptance";
export const INVITATION_PROOF_MAX_AGE_SECONDS = 10 * 60;

type InvitationProof = {
  expiresAt: number;
  invitationToken: string;
  version: 1;
};

function sign(payload: string) {
  return createHmac("sha256", readServerEnvironment().authSecret)
    .update(`invitation-proof.v1.${payload}`)
    .digest("base64url");
}

export function digestInvitationToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createInvitationProof(
  invitationToken: string,
  now = new Date(),
) {
  const proof: InvitationProof = {
    version: 1,
    invitationToken,
    expiresAt:
      Math.floor(now.getTime() / 1000) + INVITATION_PROOF_MAX_AGE_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(proof)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyInvitationProof(
  value: string | undefined,
  now = new Date(),
) {
  if (!value) return null;
  const [payload, suppliedSignature, ...rest] = value.split(".");
  if (!payload || !suppliedSignature || rest.length > 0) return null;

  const expectedSignature = sign(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<InvitationProof>;
    if (
      parsed.version !== 1 ||
      typeof parsed.invitationToken !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Math.floor(now.getTime() / 1000)
    ) {
      return null;
    }
    return {
      invitationToken: parsed.invitationToken,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export function invitationProofFromCookieHeader(
  cookieHeader: string | null | undefined,
) {
  if (!cookieHeader) return undefined;
  for (const item of cookieHeader.split(";")) {
    const [name, ...valueParts] = item.trim().split("=");
    if (name === INVITATION_PROOF_COOKIE) {
      return decodeURIComponent(valueParts.join("="));
    }
  }
  return undefined;
}
