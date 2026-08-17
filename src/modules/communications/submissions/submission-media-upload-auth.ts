import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { ValidationError } from "@/platform/errors/app-error";

import {
  SUBMISSION_MEDIA_MAX_BYTES,
  validateSubmissionMediaMimeType,
} from "./submission-media-content";

const VERSION = 1;
const PURPOSE = "public-story-submission-media-upload";
const MAX_TTL_MS = 10 * 60 * 1000;

export type SubmissionMediaUploadAuthorization = Readonly<{
  token: string;
  expiresAt: Date;
}>;

export type VerifiedSubmissionMediaUploadAuthorization = Readonly<{
  attemptId: string;
  mediaId: string;
  nonce: string;
  maxByteSize: number;
  mimeType: string;
}>;

type Payload = VerifiedSubmissionMediaUploadAuthorization & {
  version: number;
  purpose: string;
  issuedAtEpochMs: number;
  expiresAtEpochMs: number;
};

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode(value: string) {
  return JSON.parse(
    Buffer.from(value, "base64url").toString("utf8"),
  ) as Payload;
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function matches(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function issueSubmissionMediaUploadAuthorization(input: {
  readonly secret: string;
  readonly attemptId: string;
  readonly mediaId: string;
  readonly mimeType: string;
  readonly maxByteSize?: number;
  readonly now?: Date;
  readonly ttlMs?: number;
}): SubmissionMediaUploadAuthorization {
  if (input.secret.length < 32)
    throw new ValidationError("Upload authorization secret is invalid.");
  validateSubmissionMediaMimeType(input.mimeType);
  const maxByteSize = input.maxByteSize ?? SUBMISSION_MEDIA_MAX_BYTES;
  if (
    !Number.isInteger(maxByteSize) ||
    maxByteSize <= 0 ||
    maxByteSize > SUBMISSION_MEDIA_MAX_BYTES
  ) {
    throw new ValidationError("Upload authorization size is invalid.");
  }
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? 5 * 60 * 1000;
  if (!Number.isInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS) {
    throw new ValidationError("Upload authorization lifetime is invalid.");
  }
  const expiresAt = new Date(now.getTime() + ttlMs);
  const payload: Payload = {
    version: VERSION,
    purpose: PURPOSE,
    attemptId: input.attemptId,
    mediaId: input.mediaId,
    nonce: randomBytes(24).toString("base64url"),
    mimeType: input.mimeType,
    maxByteSize,
    issuedAtEpochMs: now.getTime(),
    expiresAtEpochMs: expiresAt.getTime(),
  };
  const encoded = encode(payload);
  return { token: `${encoded}.${sign(encoded, input.secret)}`, expiresAt };
}

export function verifySubmissionMediaUploadAuthorization(
  token: string,
  input: { readonly secret: string; readonly now?: Date },
): VerifiedSubmissionMediaUploadAuthorization | null {
  const [encoded, signature, ...rest] = token.split(".");
  if (!encoded || !signature || rest.length !== 0 || input.secret.length < 32)
    return null;
  if (!matches(signature, sign(encoded, input.secret))) return null;
  try {
    const payload = decode(encoded);
    const now = input.now ?? new Date();
    if (
      payload.version !== VERSION ||
      payload.purpose !== PURPOSE ||
      payload.expiresAtEpochMs <= now.getTime() ||
      payload.issuedAtEpochMs > now.getTime() + 5_000 ||
      !/^[0-9a-f-]{36}$/i.test(payload.attemptId) ||
      !/^[0-9a-f-]{36}$/i.test(payload.mediaId) ||
      !/^[A-Za-z0-9_-]{20,}$/.test(payload.nonce)
    )
      return null;
    validateSubmissionMediaMimeType(payload.mimeType);
    if (
      !Number.isInteger(payload.maxByteSize) ||
      payload.maxByteSize <= 0 ||
      payload.maxByteSize > SUBMISSION_MEDIA_MAX_BYTES
    )
      return null;
    return {
      attemptId: payload.attemptId,
      mediaId: payload.mediaId,
      nonce: payload.nonce,
      mimeType: payload.mimeType,
      maxByteSize: payload.maxByteSize,
    };
  } catch {
    return null;
  }
}
