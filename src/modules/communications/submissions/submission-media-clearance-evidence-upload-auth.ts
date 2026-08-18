import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { ValidationError } from "@/platform/errors/app-error";

import {
  maximumClearanceEvidenceByteSize,
  validateClearanceEvidenceMimeType,
} from "./submission-media-clearance-evidence-content";

const VERSION = 1;
const PURPOSE = "public-story-submission-clearance-evidence-upload";
const MAX_TTL_MS = 10 * 60 * 1000;

export type ClearanceEvidenceUploadAuthorization = Readonly<{
  token: string;
  expiresAt: Date;
}>;

export type VerifiedClearanceEvidenceUploadAuthorization = Readonly<{
  clearanceId: string;
  evidenceDocumentId: string;
  uploaderAdminUserId: string;
  slot: number;
  nonce: string;
  mimeType: string;
  maxByteSize: number;
}>;

type Payload = VerifiedClearanceEvidenceUploadAuthorization & {
  version: number;
  purpose: string;
  issuedAtEpochMs: number;
  expiresAtEpochMs: number;
};

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function matches(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function issueClearanceEvidenceUploadAuthorization(input: {
  readonly secret: string;
  readonly clearanceId: string;
  readonly evidenceDocumentId: string;
  readonly uploaderAdminUserId: string;
  readonly slot: number;
  readonly mimeType: string;
  readonly now?: Date;
  readonly ttlMs?: number;
}): ClearanceEvidenceUploadAuthorization {
  if (input.secret.length < 32)
    throw new ValidationError(
      "Evidence upload authorization secret is invalid.",
    );
  validateClearanceEvidenceMimeType(input.mimeType);
  if (!Number.isInteger(input.slot) || input.slot < 1)
    throw new ValidationError("Evidence upload slot is invalid.");
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? 5 * 60 * 1000;
  if (!Number.isInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS)
    throw new ValidationError(
      "Evidence upload authorization lifetime is invalid.",
    );
  const expiresAt = new Date(now.getTime() + ttlMs);
  const payload: Payload = {
    version: VERSION,
    purpose: PURPOSE,
    clearanceId: input.clearanceId,
    evidenceDocumentId: input.evidenceDocumentId,
    uploaderAdminUserId: input.uploaderAdminUserId,
    slot: input.slot,
    nonce: randomBytes(24).toString("base64url"),
    mimeType: input.mimeType,
    maxByteSize: maximumClearanceEvidenceByteSize(input.mimeType),
    issuedAtEpochMs: now.getTime(),
    expiresAtEpochMs: expiresAt.getTime(),
  };
  const encoded = encode(payload);
  return { token: `${encoded}.${sign(encoded, input.secret)}`, expiresAt };
}

export function verifyClearanceEvidenceUploadAuthorization(
  token: string,
  input: { readonly secret: string; readonly now?: Date },
): VerifiedClearanceEvidenceUploadAuthorization | null {
  if (input.secret.length < 32) return null;
  const [encoded, signature, ...rest] = token.split(".");
  if (!encoded || !signature || rest.length !== 0) return null;
  if (!matches(signature, sign(encoded, input.secret))) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Payload;
    if (
      payload.version !== VERSION ||
      payload.purpose !== PURPOSE ||
      !Number.isInteger(payload.slot) ||
      payload.slot < 1 ||
      !Number.isInteger(payload.maxByteSize) ||
      payload.maxByteSize <= 0 ||
      payload.expiresAtEpochMs <= (input.now ?? new Date()).getTime() ||
      typeof payload.clearanceId !== "string" ||
      typeof payload.evidenceDocumentId !== "string" ||
      typeof payload.uploaderAdminUserId !== "string" ||
      typeof payload.nonce !== "string" ||
      typeof payload.mimeType !== "string"
    ) {
      return null;
    }
    validateClearanceEvidenceMimeType(payload.mimeType);
    if (
      payload.maxByteSize !== maximumClearanceEvidenceByteSize(payload.mimeType)
    )
      return null;
    return {
      clearanceId: payload.clearanceId,
      evidenceDocumentId: payload.evidenceDocumentId,
      uploaderAdminUserId: payload.uploaderAdminUserId,
      slot: payload.slot,
      nonce: payload.nonce,
      mimeType: payload.mimeType,
      maxByteSize: payload.maxByteSize,
    };
  } catch {
    return null;
  }
}
