import { describe, expect, it } from "vitest";

import { PublicStorySubmissionStatus } from "@/generated/prisma/client";
import {
  assertAllowedSubmissionTransition,
  isAllowedSubmissionTransition,
  normalizeSubmissionEmail,
  validateInternalReviewNote,
  validateReceivePublicStorySubmissionInput,
} from "@/modules/communications/submissions";
import { ValidationError } from "@/platform/errors/app-error";

const base = {
  submitterName: "Jordan Example",
  submitterEmail: "  Jordan.Example@Example.ORG ",
  relationshipToHabitat: "Community volunteer",
  suggestedTitle: "A neighborhood built together",
  storyText:
    "This is a sufficiently long plain-text story about how Habitat helped our neighborhood work together.",
  contactConsent: true,
  privacyNoticeVersion: "public-story-v1",
  privacyNoticeAcceptedAt: new Date("2040-08-16T12:00:00Z"),
  editorialReviewAcknowledged: true,
  sensitiveDataWarningAcknowledged: true,
};

describe("Public Story Submission domain contract", () => {
  it("normalizes email and keeps optional publication interest separate", () => {
    expect(normalizeSubmissionEmail("  PERSON@Example.org ")).toBe(
      "person@example.org",
    );
    expect(validateReceivePublicStorySubmissionInput(base)).toMatchObject({
      submitterEmail: "jordan.example@example.org",
      publicationInterest: null,
    });
    expect(
      validateReceivePublicStorySubmissionInput({
        ...base,
        publicationInterest: false,
      }).publicationInterest,
    ).toBe(false);
  });

  it("requires all receive acknowledgements and bounded plain text", () => {
    for (const field of [
      "contactConsent",
      "editorialReviewAcknowledged",
      "sensitiveDataWarningAcknowledged",
    ] as const) {
      expect(() =>
        validateReceivePublicStorySubmissionInput({ ...base, [field]: false }),
      ).toThrow(ValidationError);
    }
    expect(() =>
      validateReceivePublicStorySubmissionInput({
        ...base,
        storyText: "too short",
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateReceivePublicStorySubmissionInput({
        ...base,
        storyText: "x".repeat(12_001),
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateReceivePublicStorySubmissionInput({
        ...base,
        submitterEmail: "not-an-email",
      }),
    ).toThrow(ValidationError);
  });

  it("implements the closed active transition matrix and terminal states", () => {
    expect(
      isAllowedSubmissionTransition(
        PublicStorySubmissionStatus.RECEIVED,
        PublicStorySubmissionStatus.IN_REVIEW,
      ),
    ).toBe(true);
    expect(
      isAllowedSubmissionTransition(
        PublicStorySubmissionStatus.IN_REVIEW,
        PublicStorySubmissionStatus.FOLLOW_UP,
      ),
    ).toBe(true);
    expect(
      isAllowedSubmissionTransition(
        PublicStorySubmissionStatus.FOLLOW_UP,
        PublicStorySubmissionStatus.IN_REVIEW,
      ),
    ).toBe(true);
    expect(
      isAllowedSubmissionTransition(
        PublicStorySubmissionStatus.RECEIVED,
        PublicStorySubmissionStatus.FOLLOW_UP,
      ),
    ).toBe(false);
    expect(
      isAllowedSubmissionTransition(
        PublicStorySubmissionStatus.ACCEPTED,
        PublicStorySubmissionStatus.IN_REVIEW,
      ),
    ).toBe(false);
    expect(() =>
      assertAllowedSubmissionTransition(
        PublicStorySubmissionStatus.SPAM,
        PublicStorySubmissionStatus.ACCEPTED,
      ),
    ).toThrow(ValidationError);
  });

  it("bounds internal notes and treats blank as absent", () => {
    expect(validateInternalReviewNote("  ")).toBeNull();
    expect(validateInternalReviewNote("Needs a permission follow-up.")).toBe(
      "Needs a permission follow-up.",
    );
    expect(() => validateInternalReviewNote("x".repeat(2_001))).toThrow(
      ValidationError,
    );
  });
});
