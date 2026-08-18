import {
  PublicStorySubmissionMediaClearanceRevocationReason,
  PublicStorySubmissionMediaClearanceStatus,
  PublicStorySubmissionMediaClearanceType,
  PublicStorySubmissionMediaEvidenceType,
  PublicStorySubmissionMediaRestrictionReason,
  PublicStorySubmissionMediaSubjectType,
  PublicStorySubmissionMediaUse,
} from "@/generated/prisma/client";
import { ValidationError } from "@/platform/errors/app-error";

export const CLEARANCE_NOTE_MAX_LENGTH = 1_000;
export const EXISTING_EVIDENCE_REFERENCE_MAX_LENGTH = 240;
export const EXISTING_EVIDENCE_VERSION_MAX_LENGTH = 64;
export const SUBJECT_LABEL_MAX_LENGTH = 160;

export const MEDIA_CLEARANCE_TYPES = Object.values(
  PublicStorySubmissionMediaClearanceType,
) as readonly PublicStorySubmissionMediaClearanceType[];
export const MEDIA_EVIDENCE_TYPES = Object.values(
  PublicStorySubmissionMediaEvidenceType,
) as readonly PublicStorySubmissionMediaEvidenceType[];
export const MEDIA_USES = Object.values(
  PublicStorySubmissionMediaUse,
) as readonly PublicStorySubmissionMediaUse[];

export type MediaFlags = Readonly<{
  involvesMinor: boolean;
  involvesHomeownerOrApplicant: boolean;
  involvesOtherIdentifiablePerson: boolean;
  depictsPrivateResidence: boolean;
  containsSensitivePersonalCircumstances: boolean;
}>;

export type SubjectFact = Readonly<{
  id: string;
  subjectType: PublicStorySubmissionMediaSubjectType;
  isSubmitter: boolean;
}>;

export type ClearanceRequirement = Readonly<{
  clearanceType: PublicStorySubmissionMediaClearanceType;
  subjectId: string | null;
}>;

export const MEDIA_ELIGIBILITY_REASONS = [
  "MEDIA_NOT_READY",
  "MEDIA_RESTRICTED",
  "MISSING_IMAGE_RIGHTS",
  "MISSING_IDENTIFIABLE_ADULT_CLEARANCE",
  "MISSING_MINOR_GUARDIAN_CLEARANCE",
  "MISSING_HOMEOWNER_APPLICANT_CLEARANCE",
  "MISSING_PRIVATE_RESIDENCE_CLEARANCE",
  "MISSING_SENSITIVE_CIRCUMSTANCES_CLEARANCE",
  "MISSING_SUBMITTER_LIKENESS_CONSENT",
  "CLEARANCE_PENDING",
  "CLEARANCE_REJECTED",
  "CLEARANCE_EXPIRED",
  "CLEARANCE_REVOKED",
  "USAGE_NOT_PERMITTED",
] as const;
export type MediaEligibilityReasonCode =
  (typeof MEDIA_ELIGIBILITY_REASONS)[number];

export type CreateMediaSubjectInput = Readonly<{
  submissionId: string;
  displayLabel: string;
  subjectType: PublicStorySubmissionMediaSubjectType;
  isSubmitter?: boolean;
  mediaIds?: readonly string[];
}>;

export type CreateMediaClearanceInput = Readonly<{
  submissionId: string;
  clearanceType: PublicStorySubmissionMediaClearanceType;
  subjectId?: string | null;
  mediaIds: readonly string[];
  dateObtained?: Date | null;
  expiresAt?: Date | null;
  evidenceType?: PublicStorySubmissionMediaEvidenceType | null;
  existingEvidenceReference?: string | null;
  existingEvidenceVersion?: string | null;
  confidentialNote?: string | null;
  websitePublicationAllowed?: boolean;
  socialMediaAllowed?: boolean;
  printAllowed?: boolean;
  fundraisingPromotionalAllowed?: boolean;
  paidAdvertisingAllowed?: boolean;
  otherRestrictionsPresent?: boolean;
  confidentialRestrictionsNote?: string | null;
}>;

export type RecordRightsDeclarationInput = Readonly<{
  submissionId: string;
  expectedSubmissionVersion: number;
  rightsDeclarationVersion: string;
  rightsDeclarationAccepted: boolean;
  rightsDeclarationAcceptedAt: Date;
  submitterLikenessConsentVersion?: string | null;
  submitterLikenessConsentAccepted?: boolean | null;
  submitterLikenessConsentAcceptedAt?: Date | null;
}>;

export type MediaEligibilityResult = Readonly<{
  mediaId: string;
  proposedUse: PublicStorySubmissionMediaUse;
  eligible: boolean;
  reasons: readonly MediaEligibilityReasonCode[];
  restrictionState: "ACTIVE" | "NONE";
}>;

export function assertMediaIdentifier(value: string, label: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new ValidationError(`${label} must be a valid identifier.`);
  }
}

export function assertPositiveVersion(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be a positive integer.`);
  }
}

function boundedText(
  value: string | null | undefined,
  label: string,
  max: number,
) {
  if (value === undefined || value === null || value.trim() === "") return null;
  const normalized = value.trim();
  if (normalized.length > max)
    throw new ValidationError(`${label} is too long.`);
  return normalized;
}

export function validateMediaSubjectInput(input: CreateMediaSubjectInput) {
  assertMediaIdentifier(input.submissionId, "Submission ID");
  if (
    !Object.values(PublicStorySubmissionMediaSubjectType).includes(
      input.subjectType,
    )
  ) {
    throw new ValidationError("Subject type is not supported.");
  }
  const displayLabel = boundedText(
    input.displayLabel,
    "Subject label",
    SUBJECT_LABEL_MAX_LENGTH,
  );
  if (!displayLabel) throw new ValidationError("Subject label is required.");
  for (const mediaId of input.mediaIds ?? [])
    assertMediaIdentifier(mediaId, "Media ID");
  return { ...input, displayLabel, isSubmitter: input.isSubmitter ?? false };
}

export function validateMediaClearanceInput(input: CreateMediaClearanceInput) {
  assertMediaIdentifier(input.submissionId, "Submission ID");
  if (!MEDIA_CLEARANCE_TYPES.includes(input.clearanceType)) {
    throw new ValidationError("Clearance type is not supported.");
  }
  if (input.subjectId) assertMediaIdentifier(input.subjectId, "Subject ID");
  if (input.mediaIds.length === 0)
    throw new ValidationError("At least one media image is required.");
  for (const mediaId of input.mediaIds)
    assertMediaIdentifier(mediaId, "Media ID");
  if (
    input.evidenceType &&
    !MEDIA_EVIDENCE_TYPES.includes(input.evidenceType)
  ) {
    throw new ValidationError("Evidence type is not supported.");
  }
  const existingEvidenceReference = boundedText(
    input.existingEvidenceReference,
    "Existing evidence reference",
    EXISTING_EVIDENCE_REFERENCE_MAX_LENGTH,
  );
  const existingEvidenceVersion = boundedText(
    input.existingEvidenceVersion,
    "Existing evidence version",
    EXISTING_EVIDENCE_VERSION_MAX_LENGTH,
  );
  if (
    input.evidenceType === "EXISTING_HABITAT_RELEASE" &&
    !existingEvidenceReference
  ) {
    throw new ValidationError(
      "An existing Habitat release requires a reference.",
    );
  }
  return {
    ...input,
    subjectId: input.subjectId ?? null,
    dateObtained: input.dateObtained ?? null,
    expiresAt: input.expiresAt ?? null,
    evidenceType: input.evidenceType ?? null,
    existingEvidenceReference,
    existingEvidenceVersion,
    confidentialNote: boundedText(
      input.confidentialNote,
      "Confidential note",
      CLEARANCE_NOTE_MAX_LENGTH,
    ),
    confidentialRestrictionsNote: boundedText(
      input.confidentialRestrictionsNote,
      "Confidential restrictions note",
      CLEARANCE_NOTE_MAX_LENGTH,
    ),
    websitePublicationAllowed: input.websitePublicationAllowed ?? false,
    socialMediaAllowed: input.socialMediaAllowed ?? false,
    printAllowed: input.printAllowed ?? false,
    fundraisingPromotionalAllowed: input.fundraisingPromotionalAllowed ?? false,
    paidAdvertisingAllowed: input.paidAdvertisingAllowed ?? false,
    otherRestrictionsPresent: input.otherRestrictionsPresent ?? false,
  };
}

export function validateRightsDeclarationInput(
  input: RecordRightsDeclarationInput,
) {
  assertMediaIdentifier(input.submissionId, "Submission ID");
  assertPositiveVersion(input.expectedSubmissionVersion, "Submission version");
  const rightsDeclarationVersion = boundedText(
    input.rightsDeclarationVersion,
    "Rights declaration version",
    64,
  );
  if (!rightsDeclarationVersion)
    throw new ValidationError("Rights declaration version is required.");
  if (!input.rightsDeclarationAccepted)
    throw new ValidationError("Rights declaration must be accepted.");
  if (
    !(input.rightsDeclarationAcceptedAt instanceof Date) ||
    Number.isNaN(input.rightsDeclarationAcceptedAt.getTime())
  ) {
    throw new ValidationError("Rights declaration acceptance time is invalid.");
  }
  if (
    input.submitterLikenessConsentAccepted &&
    !input.submitterLikenessConsentVersion
  ) {
    throw new ValidationError("Submitter likeness consent requires a version.");
  }
  return input;
}

export function requirementsForMedia(
  flags: MediaFlags,
  subjects: readonly SubjectFact[],
): readonly ClearanceRequirement[] {
  const requirements: ClearanceRequirement[] = [
    {
      clearanceType: PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
      subjectId: null,
    },
  ];
  if (flags.involvesHomeownerOrApplicant) {
    requirements.push({
      clearanceType:
        PublicStorySubmissionMediaClearanceType.HOMEOWNER_APPLICANT,
      subjectId: null,
    });
  }
  if (flags.depictsPrivateResidence) {
    requirements.push({
      clearanceType: PublicStorySubmissionMediaClearanceType.PRIVATE_RESIDENCE,
      subjectId: null,
    });
  }
  if (flags.containsSensitivePersonalCircumstances) {
    requirements.push({
      clearanceType:
        PublicStorySubmissionMediaClearanceType.SENSITIVE_CIRCUMSTANCES,
      subjectId: null,
    });
  }
  if (subjects.length === 0 && flags.involvesOtherIdentifiablePerson) {
    requirements.push({
      clearanceType: PublicStorySubmissionMediaClearanceType.IDENTIFIABLE_ADULT,
      subjectId: null,
    });
  }
  for (const subject of subjects) {
    requirements.push({
      clearanceType:
        subject.subjectType === PublicStorySubmissionMediaSubjectType.MINOR
          ? PublicStorySubmissionMediaClearanceType.MINOR_GUARDIAN
          : subject.isSubmitter
            ? PublicStorySubmissionMediaClearanceType.SUBMITTER_LIKENESS
            : PublicStorySubmissionMediaClearanceType.IDENTIFIABLE_ADULT,
      subjectId: subject.id,
    });
  }
  if (
    flags.involvesMinor &&
    !subjects.some((subject) => subject.subjectType === "MINOR")
  ) {
    requirements.push({
      clearanceType: PublicStorySubmissionMediaClearanceType.MINOR_GUARDIAN,
      subjectId: null,
    });
  }
  return requirements;
}

export function permissionFieldForUse(use: PublicStorySubmissionMediaUse) {
  const fields: Record<
    PublicStorySubmissionMediaUse,
    | "websitePublicationAllowed"
    | "socialMediaAllowed"
    | "printAllowed"
    | "fundraisingPromotionalAllowed"
    | "paidAdvertisingAllowed"
  > = {
    WEBSITE_PUBLICATION: "websitePublicationAllowed",
    SOCIAL_MEDIA: "socialMediaAllowed",
    PRINT: "printAllowed",
    FUNDRAISING_PROMOTIONAL: "fundraisingPromotionalAllowed",
    PAID_ADVERTISING: "paidAdvertisingAllowed",
  };
  return fields[use];
}

export function reasonForClearanceType(
  type: PublicStorySubmissionMediaClearanceType,
): MediaEligibilityReasonCode {
  const reasons: Record<
    PublicStorySubmissionMediaClearanceType,
    MediaEligibilityReasonCode
  > = {
    IMAGE_RIGHTS: "MISSING_IMAGE_RIGHTS",
    IDENTIFIABLE_ADULT: "MISSING_IDENTIFIABLE_ADULT_CLEARANCE",
    MINOR_GUARDIAN: "MISSING_MINOR_GUARDIAN_CLEARANCE",
    HOMEOWNER_APPLICANT: "MISSING_HOMEOWNER_APPLICANT_CLEARANCE",
    PRIVATE_RESIDENCE: "MISSING_PRIVATE_RESIDENCE_CLEARANCE",
    SENSITIVE_CIRCUMSTANCES: "MISSING_SENSITIVE_CIRCUMSTANCES_CLEARANCE",
    SUBMITTER_LIKENESS: "MISSING_SUBMITTER_LIKENESS_CONSENT",
  };
  return reasons[type];
}

export type {
  PublicStorySubmissionMediaClearanceRevocationReason,
  PublicStorySubmissionMediaClearanceStatus,
  PublicStorySubmissionMediaRestrictionReason,
};
