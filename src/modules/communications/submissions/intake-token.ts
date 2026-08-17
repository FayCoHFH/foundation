import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { z } from "zod";

import {
  PUBLIC_STORY_INTAKE_CLOCK_SKEW_MS,
  PUBLIC_STORY_INTAKE_FORM_PURPOSE,
  PUBLIC_STORY_INTAKE_MAX_TOKEN_LENGTH,
  PUBLIC_STORY_INTAKE_TOKEN_MAX_AGE_MS,
  PUBLIC_STORY_INTAKE_TOKEN_VERSION,
} from "./intake-contract";

const tokenPayloadSchema = z
  .object({
    v: z.literal(PUBLIC_STORY_INTAKE_TOKEN_VERSION),
    iat: z.number().int(),
    exp: z.number().int(),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    privacyNoticeVersion: z.string().trim().min(1).max(64),
    purpose: z.literal(PUBLIC_STORY_INTAKE_FORM_PURPOSE),
  })
  .strict();

export type PublicStoryIntakeToken = Readonly<{
  issuedAt: Date;
  expiresAt: Date;
  nonce: string;
  privacyNoticeVersion: string;
}>;

type TokenConfig = Readonly<{
  secret: string;
  privacyNoticeVersion: string;
}>;

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function safeJsonDecode(value: string) {
  if (value.length > 2_048) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function issuePublicStorySubmissionToken(
  config: TokenConfig,
  now = new Date(),
) {
  const issuedAt = Math.floor(now.valueOf() / 1_000);
  const expiresAt = issuedAt + PUBLIC_STORY_INTAKE_TOKEN_MAX_AGE_MS / 1_000;
  const payload = encode(
    JSON.stringify({
      v: PUBLIC_STORY_INTAKE_TOKEN_VERSION,
      iat: issuedAt,
      exp: expiresAt,
      nonce: randomBytes(16).toString("base64url"),
      privacyNoticeVersion: config.privacyNoticeVersion,
      purpose: PUBLIC_STORY_INTAKE_FORM_PURPOSE,
    }),
  );
  return `${payload}.${signature(payload, config.secret)}`;
}

export function verifyPublicStorySubmissionToken(
  token: string,
  config: TokenConfig,
  now = new Date(),
): PublicStoryIntakeToken | null {
  if (
    typeof token !== "string" ||
    token.length < 1 ||
    token.length > PUBLIC_STORY_INTAKE_MAX_TOKEN_LENGTH ||
    /\s/.test(token)
  ) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const [payloadPart, suppliedSignature] = parts;
  const expectedSignature = signature(payloadPart, config.secret);
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return null;

  let decoded: unknown;
  try {
    decoded = safeJsonDecode(decode(payloadPart));
  } catch {
    return null;
  }
  const parsed = tokenPayloadSchema.safeParse(decoded);
  if (!parsed.success) return null;
  if (parsed.data.privacyNoticeVersion !== config.privacyNoticeVersion) {
    return null;
  }

  const nowMs = now.valueOf();
  const issuedAtMs = parsed.data.iat * 1_000;
  const expiresAtMs = parsed.data.exp * 1_000;
  if (parsed.data.exp <= parsed.data.iat) return null;
  if (issuedAtMs - nowMs > PUBLIC_STORY_INTAKE_CLOCK_SKEW_MS) return null;
  if (nowMs > expiresAtMs) return null;
  if (
    nowMs - issuedAtMs >
    PUBLIC_STORY_INTAKE_TOKEN_MAX_AGE_MS + PUBLIC_STORY_INTAKE_CLOCK_SKEW_MS
  ) {
    return null;
  }

  return {
    issuedAt: new Date(issuedAtMs),
    expiresAt: new Date(expiresAtMs),
    nonce: parsed.data.nonce,
    privacyNoticeVersion: parsed.data.privacyNoticeVersion,
  };
}

export function hashPublicStorySubmissionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function fingerprintPublicStoryIntakeValue(
  scope: "network" | "email" | "global",
  value: string,
  secret: string,
) {
  return createHmac("sha256", secret)
    .update(`${scope}:${value}`, "utf8")
    .digest("hex");
}

export function completionTimeAllowsSubmission(
  token: PublicStoryIntakeToken,
  now: Date,
) {
  return now.valueOf() - token.issuedAt.valueOf() >= 1_000;
}
