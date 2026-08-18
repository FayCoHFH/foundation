import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const action = vi.hoisted(() => vi.fn());
vi.mock("@/app/admin/communications/submissions/media-actions", () =>
  Object.fromEntries(
    [
      "createSubmissionMediaClearanceFormAction",
      "createSubmissionMediaSubjectFormAction",
      "promoteSubmissionMediaFormAction",
      "rejectSubmissionMediaClearanceFormAction",
      "removeSubmissionClearanceEvidenceFormAction",
      "restoreSubmissionMediaEligibilityFormAction",
      "restrictSubmissionMediaFormAction",
      "revokeSubmissionMediaClearanceFormAction",
      "setSubmissionMediaClearanceApplicabilityFormAction",
      "updateSubmissionMediaClearanceFormAction",
      "uploadSubmissionClearanceEvidenceFormAction",
      "verifySubmissionMediaClearanceFormAction",
    ].map((name) => [name, action]),
  ),
);

import {
  SubmissionMediaDetailContent,
  SubmissionMediaSummarySection,
} from "@/app/admin/communications/submissions/media-ui";
import type { SubmissionMediaAdminReview } from "@/modules/communications/submissions/submission-media-admin-service";
import type { SubmissionMediaAdminItem } from "@/modules/communications/submissions/submission-media-service";

const id = "11111111-1111-4111-8111-111111111111";
const mediaId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-08-17T18:00:00.000Z");

const media: SubmissionMediaAdminItem = {
  id: mediaId,
  version: 3,
  ordinal: 1,
  originalFilename: null,
  declaredMimeType: "image/jpeg",
  byteSize: 100,
  technicalStatus: "READY",
  rejectionReason: null,
  description: "Volunteer in a blue shirt",
  suggestedPhotoCredit: "Contributor suggestion",
  sensitivity: {
    involvesMinor: true,
    involvesHomeownerOrApplicant: false,
    involvesOtherIdentifiablePerson: true,
    depictsPrivateResidence: true,
    containsSensitivePersonalCircumstances: false,
  },
  detectedFormat: "JPEG",
  sourceWidth: 1200,
  sourceHeight: 800,
  reviewDerivativeFormat: "JPEG",
  reviewDerivativeWidth: 1200,
  reviewDerivativeHeight: 800,
  reviewDerivativeByteSize: 80,
  processedAt: now,
  createdAt: now,
  updatedAt: now,
};

const review: SubmissionMediaAdminReview = {
  submissionId: id,
  availableMedia: [{ id: mediaId, ordinal: 1 }],
  media: {
    media,
    requiredClearances: [
      { clearanceType: "IMAGE_RIGHTS", subjectId: null },
      {
        clearanceType: "MINOR_GUARDIAN",
        subjectId: "33333333-3333-4333-8333-333333333333",
      },
    ],
    eligibility: [
      {
        proposedUse: "WEBSITE_PUBLICATION",
        label: "Website/publication",
        eligible: false,
        reasons: ["CLEARANCE_PENDING"],
      },
      {
        proposedUse: "SOCIAL_MEDIA",
        label: "Social media",
        eligible: false,
        reasons: ["CLEARANCE_PENDING"],
      },
      {
        proposedUse: "PRINT",
        label: "Print",
        eligible: false,
        reasons: ["CLEARANCE_PENDING"],
      },
      {
        proposedUse: "FUNDRAISING_PROMOTIONAL",
        label: "Fundraising/promotional",
        eligible: false,
        reasons: ["CLEARANCE_PENDING"],
      },
      {
        proposedUse: "PAID_ADVERTISING",
        label: "Paid advertising",
        eligible: false,
        reasons: ["CLEARANCE_PENDING"],
      },
    ],
    restriction: { state: "NONE", version: null },
    promotion: null,
  },
  subjects: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      displayLabel: "Volunteer in blue shirt",
      subjectType: "IDENTIFIABLE_ADULT",
      isSubmitter: false,
      mediaIds: [mediaId],
    },
  ],
  clearances: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      clearanceType: "IMAGE_RIGHTS",
      status: "PENDING",
      subject: null,
      dateObtained: null,
      dateVerified: null,
      verifiedByAdminUserId: null,
      expiresAt: null,
      evidenceType: "EXISTING_HABITAT_RELEASE",
      existingEvidenceReference: "release-42",
      existingEvidenceVersion: null,
      confidentialNote: null,
      usage: {
        websitePublicationAllowed: false,
        socialMediaAllowed: false,
        printAllowed: false,
        fundraisingPromotionalAllowed: false,
        paidAdvertisingAllowed: false,
      },
      otherRestrictionsPresent: false,
      confidentialRestrictionsNote: null,
      applicableMediaIds: [mediaId],
      version: 1,
      evidence: [],
    },
  ],
  existingUses: [],
};

describe("administrative submission media UI", () => {
  it("renders a safe media summary with private review links and no storage metadata", () => {
    const markup = renderToStaticMarkup(
      <SubmissionMediaSummarySection
        submissionId={id}
        summaries={[review.media]}
      />,
    );
    expect(markup).toContain("Media review");
    expect(markup).toContain("Ready for review");
    expect(markup).toContain("Suggested lead");
    expect(markup).toContain("Contributor suggestion");
    expect(markup).toContain("Review image and clearance");
    expect(markup).not.toContain("quarantineStorageKey");
    expect(markup).not.toContain("originalFilename");
    expect(markup).not.toContain("originalSha256");
  });

  it("renders the bounded clearance, evidence, eligibility, restriction, and promotion workflow", () => {
    const markup = renderToStaticMarkup(
      <SubmissionMediaDetailContent review={review} canPromote canRestore />,
    );
    for (const label of [
      "Private review derivative",
      "Contributor context",
      "Sensitivity declarations",
      "Subjects",
      "Clearance requirements",
      "Clearances",
      "Supporting evidence",
      "Public-use eligibility",
      "Restrictions",
      "Public credit",
      "Promotion checklist",
      "Promote to Media Library",
      "Suggested photo credit",
      "no facial recognition",
    ]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain("Minor involved");
    expect(markup).toContain("Private residence");
    expect(markup).toContain("Structured usage permissions");
    expect(markup).toContain("This clearance applies to:");
    expect(markup).toContain("No public credit");
    expect(markup).not.toContain("quarantine/");
    expect(markup).not.toContain("originalSha256");
  });
});
