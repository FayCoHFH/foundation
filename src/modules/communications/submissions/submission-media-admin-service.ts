import type { PrismaClient } from "@/generated/prisma/client";
import {
  PublicStorySubmissionMediaUse,
  type PublicStorySubmissionMediaClearanceType,
} from "@/generated/prisma/client";
import type { AdminPrincipal } from "@/platform/auth/principal";
import { NotFoundError } from "@/platform/errors/app-error";

import {
  evaluatePublicStorySubmissionMediaEligibility,
  getPublicStorySubmissionMediaRestriction,
  listPublicStorySubmissionMediaClearancesForReview,
} from "./submission-media-clearance-service";
import { getPublicStorySubmissionMediaForAdministrativeReview } from "./submission-media-service";
import {
  MEDIA_USES,
  requirementsForMedia,
  type ClearanceRequirement,
  type MediaEligibilityResult,
} from "./submission-media-clearance-content";
import { listPublicStorySubmissionClearanceEvidenceForReview } from "./submission-media-clearance-evidence-service";
import { listExistingPublicMediaUsesForReview } from "./submission-media-promotion-service";

type ReviewActor = Pick<AdminPrincipal, "adminUserId" | "capabilities">;

export type SubmissionMediaEligibilityAdminItem = Readonly<{
  proposedUse: PublicStorySubmissionMediaUse;
  label: string;
  eligible: boolean;
  reasons: readonly string[];
}>;

export type SubmissionMediaAdminSummary = Readonly<{
  media: Awaited<
    ReturnType<typeof getPublicStorySubmissionMediaForAdministrativeReview>
  >[number];
  requiredClearances: readonly ClearanceRequirement[];
  eligibility: readonly SubmissionMediaEligibilityAdminItem[];
  restriction: Readonly<{ state: "ACTIVE" | "NONE"; version: number | null }>;
  promotion: Readonly<{
    id: string;
    assetId: string;
    creditTreatment: string;
    publicCredit: string | null;
    lifecycle: string;
  }> | null;
}>;

export type SubmissionMediaAdminReview = Readonly<{
  submissionId: string;
  availableMedia: readonly Readonly<{ id: string; ordinal: number | null }>[];
  media: SubmissionMediaAdminSummary;
  subjects: readonly Readonly<{
    id: string;
    displayLabel: string;
    subjectType: string;
    isSubmitter: boolean;
    mediaIds: readonly string[];
  }>[];
  clearances: readonly Readonly<{
    id: string;
    clearanceType: PublicStorySubmissionMediaClearanceType;
    status: string;
    subject: Readonly<{
      id: string;
      displayLabel: string;
      subjectType: string;
      isSubmitter: boolean;
    }> | null;
    dateObtained: Date | null;
    dateVerified: Date | null;
    verifiedByAdminUserId: string | null;
    expiresAt: Date | null;
    evidenceType: string | null;
    existingEvidenceReference: string | null;
    existingEvidenceVersion: string | null;
    confidentialNote: string | null;
    usage: Readonly<{
      websitePublicationAllowed: boolean;
      socialMediaAllowed: boolean;
      printAllowed: boolean;
      fundraisingPromotionalAllowed: boolean;
      paidAdvertisingAllowed: boolean;
    }>;
    otherRestrictionsPresent: boolean;
    confidentialRestrictionsNote: string | null;
    applicableMediaIds: readonly string[];
    version: number;
    evidence: readonly Awaited<
      ReturnType<typeof listPublicStorySubmissionClearanceEvidenceForReview>
    >[number][];
  }>[];
  existingUses: readonly Readonly<{
    id: string;
    usageType: string;
    subjectType: string;
    subjectId: string;
    createdAt: Date;
  }>[];
}>;

const USE_LABELS: Record<PublicStorySubmissionMediaUse, string> = {
  WEBSITE_PUBLICATION: "Website/publication",
  SOCIAL_MEDIA: "Social media",
  PRINT: "Print",
  FUNDRAISING_PROMOTIONAL: "Fundraising/promotional",
  PAID_ADVERTISING: "Paid advertising",
};

export function eligibilityReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    MEDIA_NOT_READY: "Technical image processing is not ready",
    MEDIA_RESTRICTED: "Media is restricted",
    MISSING_IMAGE_RIGHTS: "Image rights clearance missing",
    MISSING_IDENTIFIABLE_ADULT_CLEARANCE:
      "Identifiable adult clearance missing",
    MISSING_MINOR_GUARDIAN_CLEARANCE: "Minor/guardian clearance missing",
    MISSING_HOMEOWNER_APPLICANT_CLEARANCE:
      "Homeowner/applicant clearance missing",
    MISSING_PRIVATE_RESIDENCE_CLEARANCE: "Private-residence review required",
    MISSING_SENSITIVE_CIRCUMSTANCES_CLEARANCE:
      "Sensitive-circumstances clearance missing",
    MISSING_SUBMITTER_LIKENESS_CONSENT: "Submitter likeness consent missing",
    CLEARANCE_PENDING: "Required clearance is pending",
    CLEARANCE_REJECTED: "Required clearance was rejected",
    CLEARANCE_EXPIRED: "Clearance expired",
    CLEARANCE_REVOKED: "Clearance revoked",
    USAGE_NOT_PERMITTED: "This use is not permitted",
  };
  return labels[reason] ?? "Additional clearance review required";
}

async function eligibility(
  prisma: PrismaClient,
  mediaId: string,
  now: Date,
): Promise<readonly SubmissionMediaEligibilityAdminItem[]> {
  return Promise.all(
    MEDIA_USES.map(
      async (proposedUse): Promise<SubmissionMediaEligibilityAdminItem> => {
        const result: MediaEligibilityResult =
          await evaluatePublicStorySubmissionMediaEligibility(prisma, {
            mediaId,
            proposedUse,
            now,
          });
        return {
          proposedUse,
          label: USE_LABELS[proposedUse],
          eligible: result.eligible,
          reasons: result.reasons,
        };
      },
    ),
  );
}

export async function getPublicStorySubmissionMediaAdminReview(
  prisma: PrismaClient,
  actor: ReviewActor,
  submissionId: string,
  mediaId: string,
  now = new Date(),
): Promise<SubmissionMediaAdminReview> {
  const mediaItems = await getPublicStorySubmissionMediaForAdministrativeReview(
    prisma,
    actor,
    submissionId,
  );
  const media = mediaItems.find((item) => item.id === mediaId);
  if (!media) throw new NotFoundError("Submission image was not found.");

  const [rawSubjects, clearances, restriction, promotion] = await Promise.all([
    prisma.publicStorySubmissionMediaSubject.findMany({
      where: { submissionId },
      select: {
        id: true,
        displayLabel: true,
        subjectType: true,
        isSubmitter: true,
        media: { select: { mediaId: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    listPublicStorySubmissionMediaClearancesForReview(
      prisma,
      actor,
      submissionId,
      now,
    ),
    getPublicStorySubmissionMediaRestriction(prisma, actor, mediaId),
    prisma.publicStorySubmissionMediaPromotion.findUnique({
      where: { sourceMediaId: mediaId },
      select: {
        id: true,
        mediaAsset: {
          select: {
            id: true,
            creditTreatment: true,
            publicCredit: true,
            lifecycle: true,
          },
        },
      },
    }),
  ]);

  const subjects = rawSubjects.map((subject) => ({
    id: subject.id,
    displayLabel: subject.displayLabel,
    subjectType: subject.subjectType,
    isSubmitter: subject.isSubmitter,
    mediaIds: subject.media.map(({ mediaId: id }) => id),
  }));
  const mediaSubjects = subjects
    .filter((subject) => subject.mediaIds.includes(mediaId))
    .map((subject) => ({
      id: subject.id,
      subjectType: subject.subjectType,
      isSubmitter: subject.isSubmitter,
    }));
  const requiredClearances = requirementsForMedia(
    media.sensitivity,
    mediaSubjects,
  );
  const mediaClearances = clearances.filter((clearance) =>
    clearance.applicableMediaIds.includes(mediaId),
  );
  const evidence = await Promise.all(
    mediaClearances.map(async (clearance) => ({
      ...clearance,
      evidence: await listPublicStorySubmissionClearanceEvidenceForReview(
        prisma,
        actor,
        clearance.id,
      ),
    })),
  );
  const existingUses = promotion
    ? await listExistingPublicMediaUsesForReview(
        prisma,
        actor,
        promotion.mediaAsset.id,
      )
    : [];

  return {
    submissionId,
    availableMedia: mediaItems.map(({ id, ordinal }) => ({ id, ordinal })),
    media: {
      media,
      requiredClearances,
      eligibility: await eligibility(prisma, mediaId, now),
      restriction,
      promotion: promotion
        ? {
            id: promotion.id,
            assetId: promotion.mediaAsset.id,
            creditTreatment: promotion.mediaAsset.creditTreatment,
            publicCredit: promotion.mediaAsset.publicCredit,
            lifecycle: promotion.mediaAsset.lifecycle,
          }
        : null,
    },
    subjects,
    clearances: evidence,
    existingUses,
  };
}

export async function listPublicStorySubmissionMediaAdminSummaries(
  prisma: PrismaClient,
  actor: ReviewActor,
  submissionId: string,
  now = new Date(),
) {
  const mediaItems = await getPublicStorySubmissionMediaForAdministrativeReview(
    prisma,
    actor,
    submissionId,
  );
  return Promise.all(
    mediaItems.map(async (item) => {
      const review = await getPublicStorySubmissionMediaAdminReview(
        prisma,
        actor,
        submissionId,
        item.id,
        now,
      );
      return review.media;
    }),
  );
}
