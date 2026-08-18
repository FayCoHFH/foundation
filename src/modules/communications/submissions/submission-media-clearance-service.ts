import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  PublicStorySubmissionMediaClearanceStatus,
  PublicStorySubmissionMediaClearanceType,
  PublicStorySubmissionMediaRestrictionState,
  PublicStorySubmissionMediaUse,
} from "@/generated/prisma/client";
import { buildAuditEvent } from "@/platform/audit/event";
import type { Capability } from "@/platform/auth/capabilities";
import type { AdminPrincipal } from "@/platform/auth/principal";
import {
  AuthorizationError,
  ConcurrencyError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from "@/platform/errors/app-error";

import type { SubmissionAuditWriter } from "./submission-service";
import {
  assertMediaIdentifier,
  assertPositiveVersion,
  permissionFieldForUse,
  reasonForClearanceType,
  requirementsForMedia,
  type ClearanceRequirement,
  type CreateMediaClearanceInput,
  type CreateMediaSubjectInput,
  type MediaEligibilityReasonCode,
  type MediaEligibilityResult,
  type RecordRightsDeclarationInput,
  type SubjectFact,
  validateMediaClearanceInput,
  validateMediaSubjectInput,
  validateRightsDeclarationInput,
} from "./submission-media-clearance-content";

type Transaction = Prisma.TransactionClient;
type ClearanceActor = Pick<AdminPrincipal, "adminUserId" | "capabilities">;

export type SubmissionMediaClearanceMutationDependencies = Readonly<{
  auditWriter?: SubmissionAuditWriter;
  now?: () => Date;
}>;

const writeAudit: SubmissionAuditWriter = async (transaction, data) => {
  await transaction.auditEvent.create({ data });
};

function requireCapabilities(
  actor: ClearanceActor,
  capabilities: readonly Capability[],
) {
  if (
    capabilities.some((capability) => !actor.capabilities.includes(capability))
  ) {
    throw new AuthorizationError();
  }
}

async function requireActiveReviewer(
  transaction: Transaction,
  actor: ClearanceActor,
) {
  requireCapabilities(actor, ["communications.submissions.review"]);
  const admin = await transaction.adminUser.findFirst({
    where: { id: actor.adminUserId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!admin) throw new AuthorizationError();
}

async function runMutation<T>(
  prisma: PrismaClient,
  operation: (transaction: Transaction) => Promise<T>,
) {
  try {
    return await prisma.$transaction(operation);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      ((error as { code?: unknown }).code === "P2002" ||
        (error as { code?: unknown }).code === "P2025")
    ) {
      throw new ConcurrencyError();
    }
    throw error;
  }
}

function uniqueIds(ids: readonly string[]) {
  return [...new Set(ids)];
}

async function assertSubmissionExists(
  transaction: Transaction,
  submissionId: string,
) {
  const submission = await transaction.publicStorySubmission.findUnique({
    where: { id: submissionId },
    select: { id: true },
  });
  if (!submission) throw new NotFoundError("Story submission was not found.");
}

async function assertMediaBelongsToSubmission(
  transaction: Transaction,
  submissionId: string,
  mediaIds: readonly string[],
) {
  const ids = uniqueIds(mediaIds);
  const count = await transaction.publicStorySubmissionMedia.count({
    where: { id: { in: ids }, submissionId },
  });
  if (count !== ids.length) {
    throw new ValidationError("Every image must belong to the submission.");
  }
  return ids;
}

const clearanceAdminSelect = {
  id: true,
  submissionId: true,
  clearanceType: true,
  status: true,
  subject: {
    select: {
      id: true,
      displayLabel: true,
      subjectType: true,
      isSubmitter: true,
    },
  },
  dateObtained: true,
  dateVerified: true,
  verifiedByAdminUserId: true,
  expiresAt: true,
  evidenceType: true,
  existingEvidenceReference: true,
  existingEvidenceVersion: true,
  confidentialNote: true,
  websitePublicationAllowed: true,
  socialMediaAllowed: true,
  printAllowed: true,
  fundraisingPromotionalAllowed: true,
  paidAdvertisingAllowed: true,
  otherRestrictionsPresent: true,
  confidentialRestrictionsNote: true,
  revokedAt: true,
  revokedByAdminUserId: true,
  revocationReason: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  applicability: { select: { mediaId: true } },
} satisfies Prisma.PublicStorySubmissionMediaClearanceSelect;

type ClearanceAdminRecord =
  Prisma.PublicStorySubmissionMediaClearanceGetPayload<{
    select: typeof clearanceAdminSelect;
  }>;

export type PublicStorySubmissionMediaClearanceAdminItem = Readonly<{
  id: string;
  submissionId: string;
  clearanceType: PublicStorySubmissionMediaClearanceType;
  status: PublicStorySubmissionMediaClearanceStatus | "EXPIRED";
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
  revokedAt: Date | null;
  revokedByAdminUserId: string | null;
  revocationReason: string | null;
  applicableMediaIds: readonly string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}>;

function effectiveStatus(
  record: {
    status: PublicStorySubmissionMediaClearanceStatus;
    expiresAt: Date | null;
  },
  now: Date,
) {
  return record.status === PublicStorySubmissionMediaClearanceStatus.VERIFIED &&
    record.expiresAt !== null &&
    record.expiresAt <= now
    ? ("EXPIRED" as const)
    : record.status;
}

function toClearanceAdmin(
  record: ClearanceAdminRecord,
  now: Date,
): PublicStorySubmissionMediaClearanceAdminItem {
  return {
    id: record.id,
    submissionId: record.submissionId,
    clearanceType: record.clearanceType,
    status: effectiveStatus(record, now),
    subject: record.subject,
    dateObtained: record.dateObtained,
    dateVerified: record.dateVerified,
    verifiedByAdminUserId: record.verifiedByAdminUserId,
    expiresAt: record.expiresAt,
    evidenceType: record.evidenceType,
    existingEvidenceReference: record.existingEvidenceReference,
    existingEvidenceVersion: record.existingEvidenceVersion,
    confidentialNote: record.confidentialNote,
    usage: {
      websitePublicationAllowed: record.websitePublicationAllowed,
      socialMediaAllowed: record.socialMediaAllowed,
      printAllowed: record.printAllowed,
      fundraisingPromotionalAllowed: record.fundraisingPromotionalAllowed,
      paidAdvertisingAllowed: record.paidAdvertisingAllowed,
    },
    otherRestrictionsPresent: record.otherRestrictionsPresent,
    confidentialRestrictionsNote: record.confidentialRestrictionsNote,
    revokedAt: record.revokedAt,
    revokedByAdminUserId: record.revokedByAdminUserId,
    revocationReason: record.revocationReason,
    applicableMediaIds: record.applicability.map((item) => item.mediaId),
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function recordPublicStorySubmissionRightsDeclaration(
  prisma: PrismaClient,
  input: RecordRightsDeclarationInput,
  dependencies: SubmissionMediaClearanceMutationDependencies = {},
) {
  const validated = validateRightsDeclarationInput(input);
  return runMutation(prisma, async (transaction) => {
    const updated = await transaction.publicStorySubmission.update({
      where: {
        id_version: {
          id: validated.submissionId,
          version: validated.expectedSubmissionVersion,
        },
      },
      data: {
        rightsDeclarationVersion: validated.rightsDeclarationVersion.trim(),
        rightsDeclarationAccepted: validated.rightsDeclarationAccepted,
        rightsDeclarationAcceptedAt: validated.rightsDeclarationAcceptedAt,
        submitterLikenessConsentVersion:
          validated.submitterLikenessConsentVersion?.trim() ?? null,
        submitterLikenessConsentAccepted:
          validated.submitterLikenessConsentAccepted ?? null,
        submitterLikenessConsentAcceptedAt:
          validated.submitterLikenessConsentAcceptedAt ?? null,
        version: { increment: 1 },
      },
      select: {
        id: true,
        version: true,
        rightsDeclarationVersion: true,
        submitterLikenessConsentVersion: true,
        updatedAt: true,
      },
    });
    await (dependencies.auditWriter ?? writeAudit)(
      transaction,
      buildAuditEvent({
        actorKind: "SYSTEM",
        action: "public_story_submission.rights_declaration_recorded",
        targetType: "PublicStorySubmission",
        targetId: updated.id,
        correlationId: randomUUID(),
        summary: {
          rightsDeclarationVersion: updated.rightsDeclarationVersion ?? "",
          hasSubmitterLikenessConsent:
            updated.submitterLikenessConsentVersion !== null,
          version: updated.version,
        },
      }),
    );
    return updated;
  });
}

export async function createPublicStorySubmissionMediaSubject(
  prisma: PrismaClient,
  actor: ClearanceActor,
  input: CreateMediaSubjectInput,
  dependencies: SubmissionMediaClearanceMutationDependencies = {},
) {
  const validated = validateMediaSubjectInput(input);
  return runMutation(prisma, async (transaction) => {
    await requireActiveReviewer(transaction, actor);
    await assertSubmissionExists(transaction, validated.submissionId);
    const mediaIds = await assertMediaBelongsToSubmission(
      transaction,
      validated.submissionId,
      validated.mediaIds ?? [],
    );
    const subject = await transaction.publicStorySubmissionMediaSubject.create({
      data: {
        submissionId: validated.submissionId,
        displayLabel: validated.displayLabel,
        subjectType: validated.subjectType,
        isSubmitter: validated.isSubmitter,
        media: { create: mediaIds.map((mediaId) => ({ mediaId })) },
      },
      select: { id: true, version: true },
    });
    await (dependencies.auditWriter ?? writeAudit)(
      transaction,
      buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action: "public_story_submission_media.subject_created",
        targetType: "PublicStorySubmissionMediaSubject",
        targetId: subject.id,
        correlationId: randomUUID(),
        summary: {
          subjectType: validated.subjectType,
          isSubmitter: validated.isSubmitter,
          mediaCount: mediaIds.length,
          version: subject.version,
        },
      }),
    );
    return subject;
  });
}

function validateSubjectForClearance(
  type: PublicStorySubmissionMediaClearanceType,
  subject: { subjectType: string; isSubmitter: boolean } | null,
) {
  const personTypes: PublicStorySubmissionMediaClearanceType[] = [
    PublicStorySubmissionMediaClearanceType.IDENTIFIABLE_ADULT,
    PublicStorySubmissionMediaClearanceType.MINOR_GUARDIAN,
    PublicStorySubmissionMediaClearanceType.SUBMITTER_LIKENESS,
  ];
  if (personTypes.includes(type) && !subject) {
    throw new ValidationError("This clearance type requires a subject.");
  }
  if (!personTypes.includes(type) && subject) {
    throw new ValidationError(
      "This clearance type cannot be attached to a person.",
    );
  }
  if (
    type === PublicStorySubmissionMediaClearanceType.MINOR_GUARDIAN &&
    subject?.subjectType !== "MINOR"
  ) {
    throw new ValidationError(
      "Minor guardian clearance requires a minor subject.",
    );
  }
  if (
    type === PublicStorySubmissionMediaClearanceType.IDENTIFIABLE_ADULT &&
    (subject?.subjectType !== "IDENTIFIABLE_ADULT" || subject.isSubmitter)
  ) {
    throw new ValidationError(
      "Identifiable adult clearance requires a non-submitter adult subject.",
    );
  }
  if (
    type === PublicStorySubmissionMediaClearanceType.SUBMITTER_LIKENESS &&
    !subject?.isSubmitter
  ) {
    throw new ValidationError(
      "Submitter likeness clearance requires the submitter subject.",
    );
  }
}

export async function createPublicStorySubmissionMediaClearance(
  prisma: PrismaClient,
  actor: ClearanceActor,
  input: CreateMediaClearanceInput,
  dependencies: SubmissionMediaClearanceMutationDependencies = {},
) {
  const validated = validateMediaClearanceInput(input);
  return runMutation(prisma, async (transaction) => {
    await requireActiveReviewer(transaction, actor);
    await assertSubmissionExists(transaction, validated.submissionId);
    const mediaIds = await assertMediaBelongsToSubmission(
      transaction,
      validated.submissionId,
      validated.mediaIds,
    );
    let subject: { subjectType: string; isSubmitter: boolean } | null = null;
    if (validated.subjectId) {
      subject = await transaction.publicStorySubmissionMediaSubject.findFirst({
        where: {
          id: validated.subjectId,
          submissionId: validated.submissionId,
        },
        select: { subjectType: true, isSubmitter: true },
      });
      if (!subject)
        throw new ValidationError("Subject must belong to the submission.");
    }
    validateSubjectForClearance(validated.clearanceType, subject);
    const clearance =
      await transaction.publicStorySubmissionMediaClearance.create({
        data: {
          submissionId: validated.submissionId,
          clearanceType: validated.clearanceType,
          subjectId: validated.subjectId,
          dateObtained: validated.dateObtained,
          expiresAt: validated.expiresAt,
          evidenceType: validated.evidenceType,
          existingEvidenceReference: validated.existingEvidenceReference,
          existingEvidenceVersion: validated.existingEvidenceVersion,
          confidentialNote: validated.confidentialNote,
          websitePublicationAllowed: validated.websitePublicationAllowed,
          socialMediaAllowed: validated.socialMediaAllowed,
          printAllowed: validated.printAllowed,
          fundraisingPromotionalAllowed:
            validated.fundraisingPromotionalAllowed,
          paidAdvertisingAllowed: validated.paidAdvertisingAllowed,
          otherRestrictionsPresent: validated.otherRestrictionsPresent,
          confidentialRestrictionsNote: validated.confidentialRestrictionsNote,
          applicability: { create: mediaIds.map((mediaId) => ({ mediaId })) },
        },
        select: { id: true, version: true },
      });
    await (dependencies.auditWriter ?? writeAudit)(
      transaction,
      buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action: "public_story_submission_media.clearance_created",
        targetType: "PublicStorySubmissionMediaClearance",
        targetId: clearance.id,
        correlationId: randomUUID(),
        summary: {
          clearanceType: validated.clearanceType,
          evidenceType: validated.evidenceType ?? "NONE",
          mediaCount: mediaIds.length,
          version: clearance.version,
        },
      }),
    );
    return clearance;
  });
}

export async function setPublicStorySubmissionMediaClearanceApplicability(
  prisma: PrismaClient,
  actor: ClearanceActor,
  input: Readonly<{
    clearanceId: string;
    expectedClearanceVersion: number;
    mediaIds: readonly string[];
  }>,
  dependencies: SubmissionMediaClearanceMutationDependencies = {},
) {
  assertMediaIdentifier(input.clearanceId, "Clearance ID");
  assertPositiveVersion(input.expectedClearanceVersion, "Clearance version");
  return runMutation(prisma, async (transaction) => {
    await requireActiveReviewer(transaction, actor);
    const current =
      await transaction.publicStorySubmissionMediaClearance.findUnique({
        where: { id: input.clearanceId },
        select: {
          id: true,
          submissionId: true,
          version: true,
          applicability: { select: { mediaId: true } },
        },
      });
    if (!current) throw new NotFoundError("Clearance was not found.");
    if (current.version !== input.expectedClearanceVersion)
      throw new ConcurrencyError();
    const mediaIds = await assertMediaBelongsToSubmission(
      transaction,
      current.submissionId,
      input.mediaIds,
    );
    await transaction.publicStorySubmissionMediaClearance.update({
      where: { id_version: { id: current.id, version: current.version } },
      data: {
        version: { increment: 1 },
        applicability: {
          deleteMany: {},
          createMany: { data: mediaIds.map((mediaId) => ({ mediaId })) },
        },
      },
    });
    await (dependencies.auditWriter ?? writeAudit)(
      transaction,
      buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action: "public_story_submission_media.clearance_applicability_changed",
        targetType: "PublicStorySubmissionMediaClearance",
        targetId: current.id,
        correlationId: randomUUID(),
        summary: {
          fromMediaCount: current.applicability.length,
          toMediaCount: mediaIds.length,
          version: current.version + 1,
        },
      }),
    );
    return {
      id: current.id,
      version: current.version + 1,
      applicableMediaIds: mediaIds,
    };
  });
}

async function updateClearance(
  prisma: PrismaClient,
  actor: ClearanceActor,
  input: Readonly<{ clearanceId: string; expectedClearanceVersion: number }>,
  data: Prisma.PublicStorySubmissionMediaClearanceUncheckedUpdateInput,
  action: string,
  summary: Record<string, string | number | boolean>,
  dependencies: SubmissionMediaClearanceMutationDependencies,
) {
  assertMediaIdentifier(input.clearanceId, "Clearance ID");
  assertPositiveVersion(input.expectedClearanceVersion, "Clearance version");
  return runMutation(prisma, async (transaction) => {
    await requireActiveReviewer(transaction, actor);
    const current =
      await transaction.publicStorySubmissionMediaClearance.findUnique({
        where: { id: input.clearanceId },
        select: { id: true, version: true, status: true },
      });
    if (!current) throw new NotFoundError("Clearance was not found.");
    if (current.version !== input.expectedClearanceVersion)
      throw new ConcurrencyError();
    await transaction.publicStorySubmissionMediaClearance.update({
      where: { id_version: { id: current.id, version: current.version } },
      data: { ...data, version: { increment: 1 } },
    });
    await (dependencies.auditWriter ?? writeAudit)(
      transaction,
      buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action,
        targetType: "PublicStorySubmissionMediaClearance",
        targetId: current.id,
        correlationId: randomUUID(),
        summary: { ...summary, version: current.version + 1 },
      }),
    );
    return { id: current.id, version: current.version + 1 };
  });
}

export async function verifyPublicStorySubmissionMediaClearance(
  prisma: PrismaClient,
  actor: ClearanceActor,
  input: Readonly<{
    clearanceId: string;
    expectedClearanceVersion: number;
    dateObtained?: Date | null;
    /** Required when verification deliberately relies on uploaded evidence. */
    evidenceDocumentId?: string | null;
  }>,
  dependencies: SubmissionMediaClearanceMutationDependencies = {},
) {
  assertMediaIdentifier(input.clearanceId, "Clearance ID");
  assertPositiveVersion(input.expectedClearanceVersion, "Clearance version");
  if (input.evidenceDocumentId)
    assertMediaIdentifier(input.evidenceDocumentId, "Evidence document ID");
  return runMutation(prisma, async (transaction) => {
    await requireActiveReviewer(transaction, actor);
    const current =
      await transaction.publicStorySubmissionMediaClearance.findUnique({
        where: { id: input.clearanceId },
        select: { id: true, version: true },
      });
    if (!current) throw new NotFoundError("Clearance was not found.");
    if (current.version !== input.expectedClearanceVersion)
      throw new ConcurrencyError();
    if (input.evidenceDocumentId) {
      const evidence =
        await transaction.publicStorySubmissionMediaClearanceEvidenceDocument.findFirst(
          {
            where: {
              id: input.evidenceDocumentId,
              clearanceId: current.id,
              technicalStatus: "READY",
            },
            select: { id: true },
          },
        );
      if (!evidence)
        throw new PreconditionError(
          "Verification evidence must be Ready and belong to this clearance.",
        );
    }
    await transaction.publicStorySubmissionMediaClearance.update({
      where: { id_version: { id: current.id, version: current.version } },
      data: {
        status: "VERIFIED",
        ...(input.dateObtained !== undefined
          ? { dateObtained: input.dateObtained }
          : {}),
        verificationEvidenceDocumentId: input.evidenceDocumentId ?? null,
        dateVerified: dependencies.now?.() ?? new Date(),
        verifiedByAdminUserId: actor.adminUserId,
        revokedAt: null,
        revokedByAdminUserId: null,
        revocationReason: null,
        version: { increment: 1 },
      },
    });
    await (dependencies.auditWriter ?? writeAudit)(
      transaction,
      buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action: "public_story_submission_media.clearance_verified",
        targetType: "PublicStorySubmissionMediaClearance",
        targetId: current.id,
        correlationId: randomUUID(),
        summary: {
          status: "VERIFIED",
          usesUploadedEvidence:
            input.evidenceDocumentId !== undefined &&
            input.evidenceDocumentId !== null,
          version: current.version + 1,
        },
      }),
    );
    return { id: current.id, version: current.version + 1 };
  });
}

export const rejectPublicStorySubmissionMediaClearance = (
  prisma: PrismaClient,
  actor: ClearanceActor,
  input: Readonly<{ clearanceId: string; expectedClearanceVersion: number }>,
  dependencies: SubmissionMediaClearanceMutationDependencies = {},
) =>
  updateClearance(
    prisma,
    actor,
    input,
    { status: "REJECTED", dateVerified: null, verifiedByAdminUserId: null },
    "public_story_submission_media.clearance_rejected",
    { status: "REJECTED" },
    dependencies,
  );

export const revokePublicStorySubmissionMediaClearance = (
  prisma: PrismaClient,
  actor: ClearanceActor,
  input: Readonly<{
    clearanceId: string;
    expectedClearanceVersion: number;
    revocationReason:
      "SUBJECT_REQUEST" | "STAFF_REVIEW" | "EVIDENCE_INVALIDATED";
  }>,
  dependencies: SubmissionMediaClearanceMutationDependencies = {},
) =>
  updateClearance(
    prisma,
    actor,
    input,
    {
      status: "REVOKED",
      revokedAt: dependencies.now?.() ?? new Date(),
      revokedByAdminUserId: actor.adminUserId,
      revocationReason: input.revocationReason,
    },
    "public_story_submission_media.clearance_revoked",
    { status: "REVOKED", revocationReason: input.revocationReason },
    dependencies,
  );

export async function listPublicStorySubmissionMediaClearancesForReview(
  prisma: PrismaClient,
  actor: ClearanceActor,
  submissionId: string,
  now = new Date(),
) {
  assertMediaIdentifier(submissionId, "Submission ID");
  requireCapabilities(actor, ["communications.submissions.review"]);
  await requireActiveReviewer(prisma, actor);
  const records = await prisma.publicStorySubmissionMediaClearance.findMany({
    where: { submissionId },
    select: clearanceAdminSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return records.map((record) => toClearanceAdmin(record, now));
}

type EligibilityClearance = {
  id: string;
  clearanceType: PublicStorySubmissionMediaClearanceType;
  status: PublicStorySubmissionMediaClearanceStatus;
  subjectId: string | null;
  expiresAt: Date | null;
  websitePublicationAllowed: boolean;
  socialMediaAllowed: boolean;
  printAllowed: boolean;
  fundraisingPromotionalAllowed: boolean;
  paidAdvertisingAllowed: boolean;
  otherRestrictionsPresent: boolean;
};

async function evaluateMediaEligibility(
  transaction: Transaction,
  mediaId: string,
  proposedUse: PublicStorySubmissionMediaUse,
  now: Date,
  ignoreRestriction = false,
): Promise<MediaEligibilityResult> {
  const media = await transaction.publicStorySubmissionMedia.findUnique({
    where: { id: mediaId },
    select: {
      id: true,
      submissionId: true,
      technicalStatus: true,
      involvesMinor: true,
      involvesHomeownerOrApplicant: true,
      involvesOtherIdentifiablePerson: true,
      depictsPrivateResidence: true,
      containsSensitivePersonalCircumstances: true,
      subjectApplicability: {
        select: {
          subject: {
            select: { id: true, subjectType: true, isSubmitter: true },
          },
        },
      },
      clearances: {
        select: {
          clearance: {
            select: {
              id: true,
              clearanceType: true,
              status: true,
              subjectId: true,
              expiresAt: true,
              websitePublicationAllowed: true,
              socialMediaAllowed: true,
              printAllowed: true,
              fundraisingPromotionalAllowed: true,
              paidAdvertisingAllowed: true,
              otherRestrictionsPresent: true,
            },
          },
        },
      },
      restrictions: {
        where: { state: "ACTIVE" },
        select: { state: true },
        take: 1,
      },
    },
  });
  if (!media) throw new NotFoundError("Submission image was not found.");
  const reasons = new Set<MediaEligibilityReasonCode>();
  const restrictionState = media.restrictions.length > 0 ? "ACTIVE" : "NONE";
  if (media.technicalStatus !== "READY") reasons.add("MEDIA_NOT_READY");
  if (!ignoreRestriction && restrictionState === "ACTIVE")
    reasons.add("MEDIA_RESTRICTED");
  const subjects: SubjectFact[] = media.subjectApplicability.map(
    ({ subject }) => subject,
  );
  const requirements: readonly ClearanceRequirement[] = requirementsForMedia(
    media,
    subjects,
  );
  const clearances: EligibilityClearance[] = media.clearances.map(
    ({ clearance }) => clearance,
  );
  const permissionField = permissionFieldForUse(proposedUse);
  for (const requirement of requirements) {
    const candidates = clearances.filter(
      (clearance) =>
        clearance.clearanceType === requirement.clearanceType &&
        (requirement.subjectId === null ||
          clearance.subjectId === requirement.subjectId),
    );
    const valid = candidates.some(
      (clearance) =>
        clearance.status === "VERIFIED" &&
        (clearance.expiresAt === null || clearance.expiresAt > now) &&
        !clearance.otherRestrictionsPresent &&
        clearance[permissionField],
    );
    if (valid) continue;
    if (candidates.some((clearance) => clearance.status === "REVOKED"))
      reasons.add("CLEARANCE_REVOKED");
    else if (
      candidates.some(
        (clearance) =>
          clearance.status === "VERIFIED" &&
          clearance.expiresAt !== null &&
          clearance.expiresAt <= now,
      )
    )
      reasons.add("CLEARANCE_EXPIRED");
    else if (candidates.some((clearance) => clearance.status === "REJECTED"))
      reasons.add("CLEARANCE_REJECTED");
    else if (candidates.some((clearance) => clearance.status === "PENDING"))
      reasons.add("CLEARANCE_PENDING");
    else reasons.add(reasonForClearanceType(requirement.clearanceType));
  }
  for (const clearance of clearances) {
    if (clearance.status === "REVOKED") reasons.add("CLEARANCE_REVOKED");
    if (
      clearance.status === "VERIFIED" &&
      clearance.expiresAt !== null &&
      clearance.expiresAt <= now
    )
      reasons.add("CLEARANCE_EXPIRED");
    if (
      clearance.status === "VERIFIED" &&
      (!clearance[permissionField] || clearance.otherRestrictionsPresent)
    )
      reasons.add("USAGE_NOT_PERMITTED");
  }
  return {
    mediaId,
    proposedUse,
    eligible: reasons.size === 0,
    reasons: [...reasons],
    restrictionState,
  };
}

export async function evaluatePublicStorySubmissionMediaEligibility(
  prisma: PrismaClient,
  input: Readonly<{
    mediaId: string;
    proposedUse: PublicStorySubmissionMediaUse;
    now?: Date;
  }>,
) {
  assertMediaIdentifier(input.mediaId, "Media ID");
  if (!Object.values(PublicStorySubmissionMediaUse).includes(input.proposedUse))
    throw new ValidationError("Proposed use is not supported.");
  return prisma.$transaction((transaction) =>
    evaluateMediaEligibility(
      transaction,
      input.mediaId,
      input.proposedUse,
      input.now ?? new Date(),
    ),
  );
}

export type RestrictSubmissionMediaInput = Readonly<{
  mediaId: string;
  reason:
    | "CLEARANCE_EXPIRED"
    | "CLEARANCE_REVOKED"
    | "CLEARANCE_INSUFFICIENT"
    | "PRIVACY_CONCERN"
    | "SUBJECT_REVOCATION_REQUEST"
    | "STAFF_REVIEW_REQUIRED";
  confidentialNote?: string | null;
  expectedRestrictionVersion: number | null;
}>;

export async function recordPublicStorySubmissionMediaRevocationRequest(
  prisma: PrismaClient,
  actor: ClearanceActor,
  input: Readonly<{
    mediaId: string;
    subjectId?: string | null;
    confidentialNote?: string | null;
  }>,
  dependencies: SubmissionMediaClearanceMutationDependencies = {},
) {
  assertMediaIdentifier(input.mediaId, "Media ID");
  if (input.subjectId) assertMediaIdentifier(input.subjectId, "Subject ID");
  return runMutation(prisma, async (transaction) => {
    await requireActiveReviewer(transaction, actor);
    const media = await transaction.publicStorySubmissionMedia.findUnique({
      where: { id: input.mediaId },
      select: { id: true, submissionId: true },
    });
    if (!media) throw new NotFoundError("Submission image was not found.");
    if (input.subjectId) {
      if (!media.submissionId)
        throw new ValidationError("Image is not attached to a submission.");
      const subject =
        await transaction.publicStorySubmissionMediaSubject.findFirst({
          where: { id: input.subjectId, submissionId: media.submissionId },
          select: { id: true },
        });
      if (!subject)
        throw new ValidationError(
          "Revocation subject must belong to the submission.",
        );
    }
    const note = input.confidentialNote?.trim() || null;
    if (note && note.length > 1_000)
      throw new ValidationError("Revocation request note is too long.");
    const request =
      await transaction.publicStorySubmissionMediaRevocationRequest.create({
        data: {
          mediaId: input.mediaId,
          subjectId: input.subjectId ?? null,
          confidentialNote: note,
        },
        select: { id: true, version: true },
      });
    const activeRestriction =
      await transaction.publicStorySubmissionMediaRestriction.findFirst({
        where: { mediaId: input.mediaId, state: "ACTIVE" },
        select: { id: true },
      });
    if (!activeRestriction) {
      await transaction.publicStorySubmissionMediaRestriction.create({
        data: {
          mediaId: input.mediaId,
          reason: "SUBJECT_REVOCATION_REQUEST",
          restrictedByAdminUserId: actor.adminUserId,
          confidentialNote: note,
        },
      });
    }
    await (dependencies.auditWriter ?? writeAudit)(
      transaction,
      buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action: "public_story_submission_media.revocation_requested",
        targetType: "PublicStorySubmissionMedia",
        targetId: input.mediaId,
        correlationId: randomUUID(),
        summary: {
          status: "OPEN",
          restrictionApplied: activeRestriction === null,
          version: request.version,
        },
      }),
    );
    return request;
  });
}

export async function restrictPublicStorySubmissionMedia(
  prisma: PrismaClient,
  actor: ClearanceActor,
  input: RestrictSubmissionMediaInput,
  dependencies: SubmissionMediaClearanceMutationDependencies = {},
) {
  assertMediaIdentifier(input.mediaId, "Media ID");
  if (input.expectedRestrictionVersion !== null)
    assertPositiveVersion(
      input.expectedRestrictionVersion,
      "Restriction version",
    );
  return runMutation(prisma, async (transaction) => {
    await requireActiveReviewer(transaction, actor);
    const current =
      await transaction.publicStorySubmissionMediaRestriction.findFirst({
        where: { mediaId: input.mediaId, state: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        select: { id: true, version: true },
      });
    if (current && input.expectedRestrictionVersion !== current.version)
      throw new ConcurrencyError();
    if (!current && input.expectedRestrictionVersion !== null)
      throw new ConcurrencyError();
    const note = input.confidentialNote?.trim() || null;
    if (note && note.length > 1_000)
      throw new ValidationError("Restriction note is too long.");
    const restriction = current
      ? await transaction.publicStorySubmissionMediaRestriction.update({
          where: { id_version: { id: current.id, version: current.version } },
          data: {
            reason: input.reason,
            confidentialNote: note,
            version: { increment: 1 },
          },
          select: { id: true, version: true },
        })
      : await transaction.publicStorySubmissionMediaRestriction.create({
          data: {
            mediaId: input.mediaId,
            reason: input.reason,
            restrictedByAdminUserId: actor.adminUserId,
            confidentialNote: note,
          },
          select: { id: true, version: true },
        });
    await (dependencies.auditWriter ?? writeAudit)(
      transaction,
      buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action: "public_story_submission_media.restricted",
        targetType: "PublicStorySubmissionMedia",
        targetId: input.mediaId,
        correlationId: randomUUID(),
        summary: {
          reason: input.reason,
          state: "ACTIVE",
          version: restriction.version,
        },
      }),
    );
    return restriction;
  });
}

export async function restorePublicStorySubmissionMediaEligibility(
  prisma: PrismaClient,
  actor: ClearanceActor,
  input: Readonly<{
    mediaId: string;
    proposedUse: PublicStorySubmissionMediaUse;
    expectedRestrictionVersion: number;
  }>,
  dependencies: SubmissionMediaClearanceMutationDependencies = {},
) {
  assertMediaIdentifier(input.mediaId, "Media ID");
  assertPositiveVersion(
    input.expectedRestrictionVersion,
    "Restriction version",
  );
  if (!Object.values(PublicStorySubmissionMediaUse).includes(input.proposedUse))
    throw new ValidationError("Proposed use is not supported.");
  return runMutation(prisma, async (transaction) => {
    await requireActiveReviewer(transaction, actor);
    requireCapabilities(actor, ["communications.media.restore_eligibility"]);
    const restriction =
      await transaction.publicStorySubmissionMediaRestriction.findFirst({
        where: { mediaId: input.mediaId, state: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        select: { id: true, version: true },
      });
    if (!restriction)
      throw new NotFoundError("Active media restriction was not found.");
    if (restriction.version !== input.expectedRestrictionVersion)
      throw new ConcurrencyError();
    const eligibility = await evaluateMediaEligibility(
      transaction,
      input.mediaId,
      input.proposedUse,
      dependencies.now?.() ?? new Date(),
      true,
    );
    if (!eligibility.eligible)
      throw new PreconditionError(
        "Media cannot be restored until its clearance requirements are satisfied.",
      );
    const restored =
      await transaction.publicStorySubmissionMediaRestriction.update({
        where: {
          id_version: { id: restriction.id, version: restriction.version },
        },
        data: {
          state: "RESTORED",
          restoredAt: dependencies.now?.() ?? new Date(),
          restoredByAdminUserId: actor.adminUserId,
          version: { increment: 1 },
        },
        select: { id: true, version: true },
      });
    await (dependencies.auditWriter ?? writeAudit)(
      transaction,
      buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action: "public_story_submission_media.restriction_restored",
        targetType: "PublicStorySubmissionMedia",
        targetId: input.mediaId,
        correlationId: randomUUID(),
        summary: {
          proposedUse: input.proposedUse,
          state: "RESTORED",
          version: restored.version,
        },
      }),
    );
    return restored;
  });
}

export async function getPublicStorySubmissionMediaRestriction(
  prisma: PrismaClient,
  actor: ClearanceActor,
  mediaId: string,
) {
  assertMediaIdentifier(mediaId, "Media ID");
  await requireActiveReviewer(prisma, actor);
  const record = await prisma.publicStorySubmissionMediaRestriction.findFirst({
    where: { mediaId, state: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: { state: true, version: true },
  });
  return record
    ? {
        state: PublicStorySubmissionMediaRestrictionState.ACTIVE,
        version: record.version,
      }
    : { state: "NONE" as const, version: null };
}
