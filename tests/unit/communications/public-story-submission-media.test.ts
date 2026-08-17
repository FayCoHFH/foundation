import { describe, expect, it } from "vitest";

import { PublicStorySubmissionMediaStatus } from "@/generated/prisma/client";
import {
  SUBMISSION_MEDIA_MAX_BYTES,
  SUBMISSION_MEDIA_MAX_TOTAL_BYTES,
  assertAllowedSubmissionMediaTransition,
  isFinalizableSubmissionMediaStatus,
  isRetainedSubmissionMediaStatus,
  validateSha256,
  validateSubmissionMediaByteSize,
  validateSubmissionMediaDescription,
  validateSubmissionMediaMimeType,
  validateSubmissionMediaOrder,
  validateSuggestedPhotoCredit,
} from "@/modules/communications/submissions";
import {
  issueSubmissionMediaUploadAuthorization,
  verifySubmissionMediaUploadAuthorization,
} from "@/modules/communications/submissions";
import { ValidationError } from "@/platform/errors/app-error";

const secret = "c6b3a-unit-upload-secret-that-is-at-least-32-bytes";
const attemptId = "11111111-1111-4111-8111-111111111111";
const mediaId = "22222222-2222-4222-8222-222222222222";

describe("C6B-3A submission media content contract", () => {
  it("enforces file, aggregate, metadata, checksum, and supported-format bounds", () => {
    expect(() => validateSubmissionMediaByteSize(0)).toThrow(ValidationError);
    expect(() =>
      validateSubmissionMediaByteSize(SUBMISSION_MEDIA_MAX_BYTES + 1),
    ).toThrow(/10 MB/);
    expect(SUBMISSION_MEDIA_MAX_TOTAL_BYTES).toBe(60 * 1024 * 1024);
    expect(validateSubmissionMediaMimeType("image/jpeg")).toBeUndefined();
    expect(() => validateSubmissionMediaMimeType("image/svg+xml")).toThrow(
      ValidationError,
    );
    expect(validateSubmissionMediaDescription("A private note.")).toBe(
      "A private note.",
    );
    expect(() => validateSubmissionMediaDescription("x".repeat(301))).toThrow(
      ValidationError,
    );
    expect(validateSuggestedPhotoCredit("Contributor suggestion")).toBe(
      "Contributor suggestion",
    );
    expect(() => validateSuggestedPhotoCredit("x".repeat(161))).toThrow(
      ValidationError,
    );
    expect(validateSha256("a".repeat(64))).toBe("a".repeat(64));
    expect(() => validateSha256("not-a-hash")).toThrow(ValidationError);
  });

  it("limits order to distinct opaque media identifiers", () => {
    expect(() => validateSubmissionMediaOrder([mediaId, mediaId])).toThrow(
      ValidationError,
    );
    expect(() => validateSubmissionMediaOrder(["not-a-uuid"])).toThrow(
      ValidationError,
    );
    expect(() =>
      validateSubmissionMediaOrder(
        Array.from(
          { length: 11 },
          (_, index) =>
            `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        ),
      ),
    ).toThrow(ValidationError);
  });

  it("allows only the bounded technical lifecycle and READY finalization", () => {
    expect(() =>
      assertAllowedSubmissionMediaTransition("PENDING_UPLOAD", "UPLOADED"),
    ).not.toThrow();
    expect(() =>
      assertAllowedSubmissionMediaTransition("PROCESSING", "READY"),
    ).not.toThrow();
    expect(() =>
      assertAllowedSubmissionMediaTransition("REJECTED", "READY"),
    ).toThrow(ValidationError);
    expect(() =>
      assertAllowedSubmissionMediaTransition("REMOVED", "UPLOADED"),
    ).toThrow(ValidationError);
    expect(
      isFinalizableSubmissionMediaStatus(
        PublicStorySubmissionMediaStatus.READY,
      ),
    ).toBe(true);
    expect(
      isFinalizableSubmissionMediaStatus(
        PublicStorySubmissionMediaStatus.PROCESSING,
      ),
    ).toBe(false);
    expect(
      isRetainedSubmissionMediaStatus(
        PublicStorySubmissionMediaStatus.REJECTED,
      ),
    ).toBe(false);
    expect(
      isRetainedSubmissionMediaStatus(PublicStorySubmissionMediaStatus.REMOVED),
    ).toBe(false);
  });
});

describe("C6B-3A upload authorization", () => {
  it("binds a short-lived one-use authorization to an attempt, media slot, type, and byte ceiling", () => {
    const authorization = issueSubmissionMediaUploadAuthorization({
      secret,
      attemptId,
      mediaId,
      mimeType: "image/png",
      now: new Date("2040-08-16T12:00:00.000Z"),
    });
    const verified = verifySubmissionMediaUploadAuthorization(
      authorization.token,
      {
        secret,
        now: new Date("2040-08-16T12:01:00.000Z"),
      },
    );
    expect(verified).toMatchObject({
      attemptId,
      mediaId,
      mimeType: "image/png",
      maxByteSize: SUBMISSION_MEDIA_MAX_BYTES,
    });
    expect(authorization.token).not.toContain(attemptId);
    expect(
      verifySubmissionMediaUploadAuthorization(`${authorization.token}x`, {
        secret,
      }),
    ).toBeNull();
    expect(
      verifySubmissionMediaUploadAuthorization(authorization.token, {
        secret,
        now: new Date("2040-08-16T12:11:00.000Z"),
      }),
    ).toBeNull();
  });
});
