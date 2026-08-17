import {
  PublicStorySubmissionMediaStatus,
  type PublicStorySubmissionMediaRejectionReason,
} from "@/generated/prisma/client";
import { ValidationError } from "@/platform/errors/app-error";

export const SUBMISSION_MEDIA_MAX_ITEMS = 10;
export const SUBMISSION_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const SUBMISSION_MEDIA_MAX_TOTAL_BYTES = 60 * 1024 * 1024;
export const SUBMISSION_MEDIA_ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;
export const SUBMISSION_MEDIA_MAX_DESCRIPTION_LENGTH = 300;
export const SUBMISSION_MEDIA_MAX_CREDIT_LENGTH = 160;
export const SUBMISSION_MEDIA_MAX_WIDTH = 12_000;
export const SUBMISSION_MEDIA_MAX_HEIGHT = 12_000;
export const SUBMISSION_MEDIA_MAX_PIXELS = 80_000_000;
export const SUBMISSION_MEDIA_REVIEW_DERIVATIVE_MAX_EDGE = 2_400;

export const submissionMediaDetectedFormats = [
  "JPEG",
  "PNG",
  "WEBP",
  "HEIF",
] as const;
export type SubmissionMediaDetectedFormat =
  (typeof submissionMediaDetectedFormats)[number];

export const submissionMediaReviewDerivativeFormat = "JPEG" as const;

export const submissionMediaMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
export type SubmissionMediaMimeType = (typeof submissionMediaMimeTypes)[number];

export type SubmissionMediaSensitivity = Readonly<{
  involvesMinor: boolean;
  involvesHomeownerOrApplicant: boolean;
  involvesOtherIdentifiablePerson: boolean;
  depictsPrivateResidence: boolean;
  containsSensitivePersonalCircumstances: boolean;
}>;

export const submissionMediaRejectionReasons = [
  "UNSUPPORTED_FORMAT",
  "MIME_TYPE_MISMATCH",
  "FILE_TOO_LARGE",
  "SUBMISSION_TOTAL_TOO_LARGE",
  "DIMENSIONS_EXCEEDED",
  "MULTI_FRAME_UNSUPPORTED",
  "CORRUPTED_IMAGE",
  "DUPLICATE_IMAGE",
  "PROCESSING_FAILED",
] as const satisfies readonly PublicStorySubmissionMediaRejectionReason[];

const mediaTransitions: Readonly<
  Record<
    PublicStorySubmissionMediaStatus,
    readonly PublicStorySubmissionMediaStatus[]
  >
> = {
  PENDING_UPLOAD: ["UPLOADED", "REJECTED", "REMOVED"],
  UPLOADED: ["PROCESSING", "REJECTED", "REMOVED"],
  // A storage failure may be returned to UPLOADED for one later server-side
  // retry. Content failures are terminal REJECTED states.
  PROCESSING: ["UPLOADED", "READY", "REJECTED", "REMOVED"],
  READY: ["REMOVED"],
  REJECTED: [],
  REMOVED: [],
};

export function validateSubmissionMediaByteSize(byteSize: number) {
  if (!Number.isInteger(byteSize) || byteSize <= 0) {
    throw new ValidationError("Image byte size must be a positive integer.");
  }
  if (byteSize > SUBMISSION_MEDIA_MAX_BYTES) {
    throw new ValidationError("An image may not exceed 10 MB.");
  }
}

export function validateSubmissionMediaMimeType(
  value: string,
): asserts value is SubmissionMediaMimeType {
  if (!(submissionMediaMimeTypes as readonly string[]).includes(value)) {
    throw new ValidationError("This image format is not supported.");
  }
}

function optionalText(
  value: string | null | undefined,
  maximum: number,
  label: string,
) {
  if (value === null || value === undefined || value === "") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum) {
    throw new ValidationError(
      `${label} must contain ${maximum} characters or fewer.`,
    );
  }
  return trimmed;
}

export function validateSubmissionMediaDescription(
  value: string | null | undefined,
) {
  return optionalText(
    value,
    SUBMISSION_MEDIA_MAX_DESCRIPTION_LENGTH,
    "Description",
  );
}

export function validateSuggestedPhotoCredit(value: string | null | undefined) {
  return optionalText(
    value,
    SUBMISSION_MEDIA_MAX_CREDIT_LENGTH,
    "Suggested photo credit",
  );
}

export function validateOriginalFilename(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 255) {
    throw new ValidationError(
      "Original filename must contain 255 characters or fewer.",
    );
  }
  return trimmed;
}

export function validateSubmissionMediaSensitivity(
  value: SubmissionMediaSensitivity,
) {
  const values = Object.values(value);
  if (values.length !== 5 || values.some((item) => typeof item !== "boolean")) {
    throw new ValidationError("Image sensitivity declarations are required.");
  }
  return value;
}

export function validateSha256(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new ValidationError("Image checksum is invalid.");
  }
  return value.toLowerCase();
}

export function assertAllowedSubmissionMediaTransition(
  from: PublicStorySubmissionMediaStatus,
  to: PublicStorySubmissionMediaStatus,
) {
  if (!mediaTransitions[from].includes(to)) {
    throw new ValidationError(`Image cannot transition from ${from} to ${to}.`);
  }
}

export function isRetainedSubmissionMediaStatus(
  status: PublicStorySubmissionMediaStatus,
) {
  return !["REJECTED", "REMOVED"].includes(status);
}

export function isFinalizableSubmissionMediaStatus(
  status: PublicStorySubmissionMediaStatus,
) {
  return status === PublicStorySubmissionMediaStatus.READY;
}

export function validateSubmissionMediaOrder(mediaIds: readonly string[]) {
  if (
    mediaIds.length > SUBMISSION_MEDIA_MAX_ITEMS ||
    new Set(mediaIds).size !== mediaIds.length
  ) {
    throw new ValidationError(
      "Image order must contain each retained image exactly once.",
    );
  }
  if (mediaIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
    throw new ValidationError("Image order contains an invalid identifier.");
  }
}
