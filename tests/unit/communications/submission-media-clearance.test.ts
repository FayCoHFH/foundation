import { describe, expect, it } from "vitest";

import {
  PublicStorySubmissionMediaClearanceType,
  PublicStorySubmissionMediaEvidenceType,
  PublicStorySubmissionMediaSubjectType,
  PublicStorySubmissionMediaUse,
} from "@/generated/prisma/client";
import {
  permissionFieldForUse,
  reasonForClearanceType,
  requirementsForMedia,
  validateMediaClearanceInput,
  validateRightsDeclarationInput,
} from "@/modules/communications/submissions";
import { ValidationError } from "@/platform/errors/app-error";

const id = "11111111-1111-4111-8111-111111111111";
const mediaId = "22222222-2222-4222-8222-222222222222";

describe("C6B-3C image rights and clearance content", () => {
  it("derives the complete requirement set from image flags and scoped subjects", () => {
    const requirements = requirementsForMedia(
      {
        involvesMinor: true,
        involvesHomeownerOrApplicant: true,
        involvesOtherIdentifiablePerson: true,
        depictsPrivateResidence: true,
        containsSensitivePersonalCircumstances: true,
      },
      [
        {
          id,
          subjectType: PublicStorySubmissionMediaSubjectType.MINOR,
          isSubmitter: false,
        },
        {
          id: mediaId,
          subjectType: PublicStorySubmissionMediaSubjectType.IDENTIFIABLE_ADULT,
          isSubmitter: false,
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          subjectType: PublicStorySubmissionMediaSubjectType.IDENTIFIABLE_ADULT,
          isSubmitter: true,
        },
      ],
    );
    expect(requirements).toEqual([
      {
        clearanceType: PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
        subjectId: null,
      },
      {
        clearanceType:
          PublicStorySubmissionMediaClearanceType.HOMEOWNER_APPLICANT,
        subjectId: null,
      },
      {
        clearanceType:
          PublicStorySubmissionMediaClearanceType.PRIVATE_RESIDENCE,
        subjectId: null,
      },
      {
        clearanceType:
          PublicStorySubmissionMediaClearanceType.SENSITIVE_CIRCUMSTANCES,
        subjectId: null,
      },
      {
        clearanceType: PublicStorySubmissionMediaClearanceType.MINOR_GUARDIAN,
        subjectId: id,
      },
      {
        clearanceType:
          PublicStorySubmissionMediaClearanceType.IDENTIFIABLE_ADULT,
        subjectId: mediaId,
      },
      {
        clearanceType:
          PublicStorySubmissionMediaClearanceType.SUBMITTER_LIKENESS,
        subjectId: "33333333-3333-4333-8333-333333333333",
      },
    ]);
  });

  it("keeps proposed-use permissions and reason codes closed and typed", () => {
    expect(
      permissionFieldForUse(PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION),
    ).toBe("websitePublicationAllowed");
    expect(
      permissionFieldForUse(PublicStorySubmissionMediaUse.PAID_ADVERTISING),
    ).toBe("paidAdvertisingAllowed");
    expect(
      reasonForClearanceType(
        PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
      ),
    ).toBe("MISSING_IMAGE_RIGHTS");
    expect(
      reasonForClearanceType(
        PublicStorySubmissionMediaClearanceType.SUBMITTER_LIKENESS,
      ),
    ).toBe("MISSING_SUBMITTER_LIKENESS_CONSENT");
  });

  it("requires a reference for an existing Habitat release and never accepts evidence by filename alone", () => {
    expect(() =>
      validateMediaClearanceInput({
        submissionId: id,
        clearanceType: PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
        mediaIds: [mediaId],
        evidenceType:
          PublicStorySubmissionMediaEvidenceType.EXISTING_HABITAT_RELEASE,
      }),
    ).toThrow(ValidationError);
    expect(
      validateMediaClearanceInput({
        submissionId: id,
        clearanceType: PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
        mediaIds: [mediaId],
        evidenceType:
          PublicStorySubmissionMediaEvidenceType.EXISTING_HABITAT_RELEASE,
        existingEvidenceReference: "release-123",
        existingEvidenceVersion: "2026-01",
      }).existingEvidenceReference,
    ).toBe("release-123");
  });

  it("requires an accepted, versioned rights declaration", () => {
    expect(() =>
      validateRightsDeclarationInput({
        submissionId: id,
        expectedSubmissionVersion: 1,
        rightsDeclarationVersion: "rights-v1",
        rightsDeclarationAccepted: false,
        rightsDeclarationAcceptedAt: new Date(),
      }),
    ).toThrow(ValidationError);
    expect(
      validateRightsDeclarationInput({
        submissionId: id,
        expectedSubmissionVersion: 1,
        rightsDeclarationVersion: "rights-v1",
        rightsDeclarationAccepted: true,
        rightsDeclarationAcceptedAt: new Date("2040-01-01T00:00:00Z"),
        submitterLikenessConsentVersion: "likeness-v1",
        submitterLikenessConsentAccepted: true,
        submitterLikenessConsentAcceptedAt: new Date("2040-01-01T00:00:00Z"),
      }).rightsDeclarationVersion,
    ).toBe("rights-v1");
  });
});
