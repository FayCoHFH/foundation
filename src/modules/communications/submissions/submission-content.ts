import { PublicStorySubmissionStatus } from "@/generated/prisma/client";
import { ValidationError } from "@/platform/errors/app-error";

export const SUBMITTER_NAME_MAX_LENGTH = 120;
export const SUBMITTER_EMAIL_MAX_LENGTH = 254;
export const RELATIONSHIP_MAX_LENGTH = 160;
export const SUGGESTED_TITLE_MAX_LENGTH = 160;
export const STORY_TEXT_MIN_LENGTH = 50;
export const STORY_TEXT_MAX_LENGTH = 12_000;
export const PRIVACY_NOTICE_VERSION_MAX_LENGTH = 64;
export const RIGHTS_DECLARATION_VERSION_MAX_LENGTH = 64;
export const INTERNAL_REVIEW_NOTE_MAX_LENGTH = 2_000;
export const ADMIN_SUBMISSION_PAGE_SIZE = 25;
export const ADMIN_SUBMISSION_MAX_PAGE_SIZE = 50;

export const PUBLIC_STORY_SUBMISSION_STATUSES = [
  PublicStorySubmissionStatus.RECEIVED,
  PublicStorySubmissionStatus.IN_REVIEW,
  PublicStorySubmissionStatus.FOLLOW_UP,
  PublicStorySubmissionStatus.ACCEPTED,
  PublicStorySubmissionStatus.DECLINED,
  PublicStorySubmissionStatus.SPAM,
] as const;

export type ReceivePublicStorySubmissionInput = Readonly<{
  submitterName: string;
  submitterEmail: string;
  relationshipToHabitat: string;
  suggestedTitle?: string | null;
  storyText: string;
  contactConsent: boolean;
  privacyNoticeVersion: string;
  privacyNoticeAcceptedAt: Date;
  editorialReviewAcknowledged: boolean;
  sensitiveDataWarningAcknowledged: boolean;
  publicationInterest?: boolean | null;
  involvesMinor?: boolean;
  involvesHomeownerOrApplicant?: boolean;
  containsSensitivePersonalCircumstances?: boolean;
  rightsDeclarationVersion?: string | null;
  rightsDeclarationAccepted?: boolean | null;
  rightsDeclarationAcceptedAt?: Date | null;
  submitterLikenessConsentVersion?: string | null;
  submitterLikenessConsentAccepted?: boolean | null;
  submitterLikenessConsentAcceptedAt?: Date | null;
}>;

export type ValidatedReceivePublicStorySubmissionInput = Readonly<{
  submitterName: string;
  submitterEmail: string;
  relationshipToHabitat: string;
  suggestedTitle: string | null;
  storyText: string;
  contactConsent: true;
  privacyNoticeVersion: string;
  privacyNoticeAcceptedAt: Date;
  editorialReviewAcknowledged: true;
  sensitiveDataWarningAcknowledged: true;
  publicationInterest: boolean | null;
  involvesMinor: boolean;
  involvesHomeownerOrApplicant: boolean;
  containsSensitivePersonalCircumstances: boolean;
  rightsDeclarationVersion: string | null;
  rightsDeclarationAccepted: boolean | null;
  rightsDeclarationAcceptedAt: Date | null;
  submitterLikenessConsentVersion: string | null;
  submitterLikenessConsentAccepted: boolean | null;
  submitterLikenessConsentAcceptedAt: Date | null;
}>;

export type SubmissionStatusTransition = Readonly<{
  from: PublicStorySubmissionStatus;
  to: PublicStorySubmissionStatus;
}>;

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new ValidationError(`${label} must be text.`);
  }
  const normalized = value.trim();
  if (!normalized) throw new ValidationError(`${label} is required.`);
  if (normalized.length > maxLength) {
    throw new ValidationError(
      `${label} must be ${maxLength} characters or fewer.`,
    );
  }
  if (/\u0000/.test(normalized)) {
    throw new ValidationError(`${label} contains an unsupported character.`);
  }
  return normalized;
}

function optionalText(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, label, maxLength);
}

function validDate(value: unknown, label: string) {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    throw new ValidationError(`${label} must be a valid instant.`);
  }
  return value;
}

function requiredTrue(value: unknown, label: string): true {
  if (value !== true) throw new ValidationError(`${label} is required.`);
  return true;
}

function optionalBoolean(
  value: unknown,
  label: string,
  fallback: boolean | null,
) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean")
    throw new ValidationError(`${label} must be boolean.`);
  return value;
}

export function normalizeSubmissionEmail(value: string) {
  const normalized = requiredText(
    value,
    "Submitter email",
    SUBMITTER_EMAIL_MAX_LENGTH,
  ).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ValidationError("Submitter email must be valid.");
  }
  return normalized;
}

export function validateReceivePublicStorySubmissionInput(
  input: ReceivePublicStorySubmissionInput,
): ValidatedReceivePublicStorySubmissionInput {
  const storyText = requiredText(
    input.storyText,
    "Story text",
    STORY_TEXT_MAX_LENGTH,
  );
  if (storyText.length < STORY_TEXT_MIN_LENGTH) {
    throw new ValidationError(
      `Story text must be at least ${STORY_TEXT_MIN_LENGTH} characters.`,
    );
  }
  return {
    submitterName: requiredText(
      input.submitterName,
      "Submitter name",
      SUBMITTER_NAME_MAX_LENGTH,
    ),
    submitterEmail: normalizeSubmissionEmail(input.submitterEmail),
    relationshipToHabitat: requiredText(
      input.relationshipToHabitat,
      "Relationship to Habitat",
      RELATIONSHIP_MAX_LENGTH,
    ),
    suggestedTitle: optionalText(
      input.suggestedTitle,
      "Suggested title",
      SUGGESTED_TITLE_MAX_LENGTH,
    ),
    storyText,
    contactConsent: requiredTrue(input.contactConsent, "Contact consent"),
    privacyNoticeVersion: requiredText(
      input.privacyNoticeVersion,
      "Privacy notice version",
      PRIVACY_NOTICE_VERSION_MAX_LENGTH,
    ),
    privacyNoticeAcceptedAt: validDate(
      input.privacyNoticeAcceptedAt,
      "Privacy notice acceptance time",
    ),
    editorialReviewAcknowledged: requiredTrue(
      input.editorialReviewAcknowledged,
      "Editorial review acknowledgement",
    ),
    sensitiveDataWarningAcknowledged: requiredTrue(
      input.sensitiveDataWarningAcknowledged,
      "Sensitive data warning acknowledgement",
    ),
    publicationInterest: optionalBoolean(
      input.publicationInterest,
      "Publication interest",
      null,
    ),
    involvesMinor: optionalBoolean(
      input.involvesMinor,
      "Minor declaration",
      false,
    ) as boolean,
    involvesHomeownerOrApplicant: optionalBoolean(
      input.involvesHomeownerOrApplicant,
      "Homeowner or applicant declaration",
      false,
    ) as boolean,
    containsSensitivePersonalCircumstances: optionalBoolean(
      input.containsSensitivePersonalCircumstances,
      "Sensitive circumstances declaration",
      false,
    ) as boolean,
    rightsDeclarationVersion: optionalText(
      input.rightsDeclarationVersion,
      "Rights declaration version",
      RIGHTS_DECLARATION_VERSION_MAX_LENGTH,
    ),
    rightsDeclarationAccepted:
      input.rightsDeclarationAccepted === undefined ||
      input.rightsDeclarationAccepted === null
        ? null
        : optionalBoolean(
            input.rightsDeclarationAccepted,
            "Rights declaration acceptance",
            null,
          ),
    rightsDeclarationAcceptedAt:
      input.rightsDeclarationAcceptedAt === undefined ||
      input.rightsDeclarationAcceptedAt === null
        ? null
        : validDate(
            input.rightsDeclarationAcceptedAt,
            "Rights declaration acceptance time",
          ),
    submitterLikenessConsentVersion: optionalText(
      input.submitterLikenessConsentVersion,
      "Submitter likeness consent version",
      RIGHTS_DECLARATION_VERSION_MAX_LENGTH,
    ),
    submitterLikenessConsentAccepted:
      input.submitterLikenessConsentAccepted === undefined ||
      input.submitterLikenessConsentAccepted === null
        ? null
        : optionalBoolean(
            input.submitterLikenessConsentAccepted,
            "Submitter likeness consent acceptance",
            null,
          ),
    submitterLikenessConsentAcceptedAt:
      input.submitterLikenessConsentAcceptedAt === undefined ||
      input.submitterLikenessConsentAcceptedAt === null
        ? null
        : validDate(
            input.submitterLikenessConsentAcceptedAt,
            "Submitter likeness consent acceptance time",
          ),
  };
}

const allowedTransitions: Readonly<
  Record<PublicStorySubmissionStatus, readonly PublicStorySubmissionStatus[]>
> = {
  [PublicStorySubmissionStatus.RECEIVED]: [
    PublicStorySubmissionStatus.IN_REVIEW,
    PublicStorySubmissionStatus.ACCEPTED,
    PublicStorySubmissionStatus.DECLINED,
    PublicStorySubmissionStatus.SPAM,
  ],
  [PublicStorySubmissionStatus.IN_REVIEW]: [
    PublicStorySubmissionStatus.FOLLOW_UP,
    PublicStorySubmissionStatus.ACCEPTED,
    PublicStorySubmissionStatus.DECLINED,
    PublicStorySubmissionStatus.SPAM,
  ],
  [PublicStorySubmissionStatus.FOLLOW_UP]: [
    PublicStorySubmissionStatus.IN_REVIEW,
    PublicStorySubmissionStatus.ACCEPTED,
    PublicStorySubmissionStatus.DECLINED,
    PublicStorySubmissionStatus.SPAM,
  ],
  [PublicStorySubmissionStatus.ACCEPTED]: [],
  [PublicStorySubmissionStatus.DECLINED]: [],
  [PublicStorySubmissionStatus.SPAM]: [],
};

export function isAllowedSubmissionTransition(
  from: PublicStorySubmissionStatus,
  to: PublicStorySubmissionStatus,
) {
  return allowedTransitions[from]?.includes(to) ?? false;
}

export function assertAllowedSubmissionTransition(
  from: PublicStorySubmissionStatus,
  to: PublicStorySubmissionStatus,
) {
  if (!isAllowedSubmissionTransition(from, to)) {
    throw new ValidationError(`Submission cannot move from ${from} to ${to}.`);
  }
}

export function assertAllowedSpamRestoration(
  from: PublicStorySubmissionStatus,
  to: PublicStorySubmissionStatus,
) {
  if (
    from !== PublicStorySubmissionStatus.SPAM ||
    to !== PublicStorySubmissionStatus.RECEIVED
  ) {
    throw new ValidationError(
      `Submission cannot be restored from ${from} to ${to}.`,
    );
  }
}

export function validateSubmissionPage(
  value: number | undefined,
  label: string,
  fallback: number,
  maximum: number,
) {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < 1 || result > maximum) {
    throw new ValidationError(`${label} must be between 1 and ${maximum}.`);
  }
  return result;
}

export function validateInternalReviewNote(value: string | null | undefined) {
  if (value === undefined || value === null || value.trim() === "") return null;
  return requiredText(
    value,
    "Internal review note",
    INTERNAL_REVIEW_NOTE_MAX_LENGTH,
  );
}
