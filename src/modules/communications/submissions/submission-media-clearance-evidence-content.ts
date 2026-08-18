import {
  PublicStorySubmissionMediaClearanceEvidenceFormat,
  PublicStorySubmissionMediaClearanceEvidenceStatus,
  type PublicStorySubmissionMediaClearanceEvidenceRejectionReason,
} from "@/generated/prisma/client";
import { ValidationError } from "@/platform/errors/app-error";

export const CLEARANCE_EVIDENCE_MAX_DOCUMENTS = 10;
export const CLEARANCE_EVIDENCE_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const CLEARANCE_EVIDENCE_MAX_PDF_BYTES = 15 * 1024 * 1024;
export const CLEARANCE_EVIDENCE_MAX_PDF_PAGES = 25;
export const CLEARANCE_EVIDENCE_MAX_WIDTH = 12_000;
export const CLEARANCE_EVIDENCE_MAX_HEIGHT = 12_000;
export const CLEARANCE_EVIDENCE_MAX_PIXELS = 80_000_000;
export const CLEARANCE_EVIDENCE_REVIEW_MAX_EDGE = 2_400;

export const clearanceEvidenceMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
export type ClearanceEvidenceMimeType =
  (typeof clearanceEvidenceMimeTypes)[number];

const mimeFormat: Readonly<
  Record<
    ClearanceEvidenceMimeType,
    PublicStorySubmissionMediaClearanceEvidenceFormat
  >
> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WEBP",
  "image/heic": "HEIF",
  "image/heif": "HEIF",
};

export const clearanceEvidenceRejectionReasons = [
  "UNSUPPORTED_FORMAT",
  "MIME_TYPE_MISMATCH",
  "FILE_TOO_LARGE",
  "CORRUPTED_FILE",
  "PDF_ENCRYPTED",
  "PDF_PAGE_LIMIT_EXCEEDED",
  "PDF_UNSAFE_STRUCTURE",
  "DIMENSIONS_EXCEEDED",
  "MULTI_FRAME_UNSUPPORTED",
  "PROCESSING_FAILED",
] as const satisfies readonly PublicStorySubmissionMediaClearanceEvidenceRejectionReason[];

export function validateClearanceEvidenceMimeType(
  value: string,
): asserts value is ClearanceEvidenceMimeType {
  if (!(clearanceEvidenceMimeTypes as readonly string[]).includes(value)) {
    throw new ValidationError(
      "This clearance evidence format is not supported.",
    );
  }
}

export function formatForClearanceEvidenceMimeType(
  value: ClearanceEvidenceMimeType,
) {
  return mimeFormat[value];
}

export function maximumClearanceEvidenceByteSize(
  mimeType: ClearanceEvidenceMimeType,
) {
  return mimeType === "application/pdf"
    ? CLEARANCE_EVIDENCE_MAX_PDF_BYTES
    : CLEARANCE_EVIDENCE_MAX_IMAGE_BYTES;
}

export function validateClearanceEvidenceByteSize(
  byteSize: number,
  mimeType: ClearanceEvidenceMimeType,
) {
  if (!Number.isInteger(byteSize) || byteSize <= 0) {
    throw new ValidationError("Evidence byte size must be a positive integer.");
  }
  if (byteSize > maximumClearanceEvidenceByteSize(mimeType)) {
    throw new ValidationError(
      mimeType === "application/pdf"
        ? "A clearance evidence PDF may not exceed 15 MB."
        : "A clearance evidence image may not exceed 10 MB.",
    );
  }
}

export function assertClearanceEvidenceIdentifier(
  value: string,
  label: string,
) {
  if (!/^[0-9a-f-]{36}$/iu.test(value)) {
    throw new ValidationError(`${label} is invalid.`);
  }
}

export function assertClearanceEvidenceVersion(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be a positive integer.`);
  }
}

export function assertClearanceEvidenceTransition(
  from: PublicStorySubmissionMediaClearanceEvidenceStatus,
  to: PublicStorySubmissionMediaClearanceEvidenceStatus,
) {
  const allowed: Readonly<
    Record<
      PublicStorySubmissionMediaClearanceEvidenceStatus,
      readonly PublicStorySubmissionMediaClearanceEvidenceStatus[]
    >
  > = {
    PENDING_UPLOAD: ["UPLOADED", "REJECTED", "REMOVED"],
    UPLOADED: ["PROCESSING", "REJECTED", "REMOVED"],
    PROCESSING: ["UPLOADED", "READY", "REJECTED", "REMOVED"],
    READY: ["REMOVED"],
    REJECTED: [],
    REMOVED: [],
  };
  if (!(allowed[from] ?? []).includes(to)) {
    throw new ValidationError(
      `Evidence cannot transition from ${from} to ${to}.`,
    );
  }
}
