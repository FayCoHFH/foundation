import "server-only";

import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";
import { prisma as runtimePrisma } from "@/platform/database/prisma";
import { readServerEnvironment } from "@/platform/config/environment";
import { ValidationError } from "@/platform/errors/app-error";
import { logger } from "@/platform/logging/logger";

import { receivePublicStorySubmissionInTransaction } from "./submission-service";
import {
  associateReadySubmissionMediaInTransaction,
  validateFinalizableSubmissionMediaInTransaction,
} from "./submission-media-service";
import { PUBLIC_STORY_SUBMISSION_RIGHTS_DECLARATION_VERSION } from "./submission-media-content";
import {
  PUBLIC_STORY_INTAKE_GENERIC_MESSAGE,
  PUBLIC_STORY_INTAKE_MIN_COMPLETION_MS,
  PUBLIC_STORY_INTAKE_SUCCESS_MESSAGE,
  PUBLIC_STORY_INTAKE_VALIDATION_MESSAGE,
  type PublicStoryIntakeConfig,
  type PublicStoryIntakeOutcome,
  type PublicStoryIntakeRequestContext,
} from "./intake-contract";
import {
  type ReceivePublicStorySubmissionInput,
  validateReceivePublicStorySubmissionInput,
} from "./submission-content";
import type { SubmissionAuditWriter } from "./submission-service";
import {
  completionTimeAllowsSubmission,
  hashPublicStorySubmissionToken,
  issuePublicStorySubmissionToken,
  verifyPublicStorySubmissionToken,
} from "./intake-token";
import {
  cleanupExpiredPublicStoryIntakeArtifacts,
  consumePublicStoryIntakeRateLimits,
  type IntakeRateLimitLimits,
} from "./intake-rate-limit";
import {
  parsePublicStorySubmissionForm,
  validatePublicStorySubmissionRequestContext,
} from "./intake-request";

export type PublicStoryIntakeDependencies = Readonly<{
  prisma?: PrismaClient;
  now?: () => Date;
  config?: PublicStoryIntakeConfig;
  rateLimits?: IntakeRateLimitLimits;
  networkIdentity?: string;
  cleanupArtifacts?: boolean;
  auditWriter?: SubmissionAuditWriter;
  tokenUseWriter?: (
    transaction: Parameters<SubmissionAuditWriter>[0],
    tokenHash: string,
    expiresAt: Date,
    consumedAt: Date,
  ) => Promise<number>;
}>;

function runtimeConfig(): PublicStoryIntakeConfig {
  const environment = readServerEnvironment();
  return {
    enabled: environment.publicStorySubmissionsEnabled,
    secret: environment.publicStorySubmissionsSecret,
    privacyNoticeVersion:
      environment.publicStorySubmissionsPrivacyNoticeVersion,
    appOrigin: environment.appBaseUrl,
    appEnv: environment.appEnv,
    isVercel: environment.isVercel,
  };
}

function configFrom(dependencies: PublicStoryIntakeDependencies) {
  return dependencies.config ?? runtimeConfig();
}

function outcome(
  code: PublicStoryIntakeOutcome["code"],
  message: string,
  fieldErrors?: Readonly<Record<string, string>>,
): PublicStoryIntakeOutcome {
  return {
    code,
    message,
    ...(fieldErrors && Object.keys(fieldErrors).length > 0
      ? { fieldErrors }
      : {}),
  };
}

function rejectedOutcome() {
  return outcome("SECURITY_REJECTED", PUBLIC_STORY_INTAKE_GENERIC_MESSAGE);
}

function classifyValidationField(message: string) {
  const fields = [
    ["Submitter name", "submitterName"],
    ["Submitter email", "submitterEmail"],
    ["Relationship to Habitat", "relationshipToHabitat"],
    ["Suggested title", "suggestedTitle"],
    ["Story text", "storyText"],
    ["Contact consent", "contactConsent"],
    ["Privacy notice version", "privacyNoticeVersion"],
    ["Editorial review acknowledgement", "editorialReviewAcknowledged"],
    [
      "Sensitive data warning acknowledgement",
      "sensitiveDataWarningAcknowledged",
    ],
  ] as const;
  return fields.find(([label]) => message.startsWith(label))?.[1];
}

function validationOutcome(error: ValidationError) {
  const field = classifyValidationField(error.message);
  return outcome(
    "VALIDATION_FAILED",
    PUBLIC_STORY_INTAKE_VALIDATION_MESSAGE,
    field ? { [field]: error.message } : undefined,
  );
}

function networkIdentity(
  headersInit: HeadersInit,
  config: PublicStoryIntakeConfig,
) {
  const headers = new Headers(headersInit);
  if (config.isVercel) {
    return headers.get("x-vercel-forwarded-for")?.trim() || "vercel-unknown";
  }
  return "local-shared-network";
}

function formInput(
  parsed: Extract<
    ReturnType<typeof parsePublicStorySubmissionForm>,
    { kind: "ok" }
  >["value"],
  tokenVersion: string,
  now: Date,
): ReceivePublicStorySubmissionInput {
  return {
    submitterName: parsed.submitterName,
    submitterEmail: parsed.submitterEmail,
    relationshipToHabitat: parsed.relationshipToHabitat,
    suggestedTitle: parsed.suggestedTitle,
    storyText: parsed.storyText,
    contactConsent: parsed.contactConsent,
    privacyNoticeVersion: tokenVersion,
    privacyNoticeAcceptedAt: now,
    editorialReviewAcknowledged: parsed.editorialReviewAcknowledged,
    sensitiveDataWarningAcknowledged: parsed.sensitiveDataWarningAcknowledged,
    publicationInterest: parsed.publicationInterest,
    involvesMinor: parsed.involvesMinor,
    involvesHomeownerOrApplicant: parsed.involvesHomeownerOrApplicant,
    containsSensitivePersonalCircumstances:
      parsed.containsSensitivePersonalCircumstances,
    rightsDeclarationAccepted:
      parsed.rightsDeclarationAccepted === true ? true : null,
    rightsDeclarationVersion:
      parsed.rightsDeclarationAccepted === true
        ? PUBLIC_STORY_SUBMISSION_RIGHTS_DECLARATION_VERSION
        : null,
    rightsDeclarationAcceptedAt:
      parsed.rightsDeclarationAccepted === true ? now : null,
    submitterLikenessConsentAccepted:
      parsed.submitterLikenessConsentAccepted === true ? true : null,
    submitterLikenessConsentVersion:
      parsed.submitterLikenessConsentAccepted === true
        ? PUBLIC_STORY_SUBMISSION_RIGHTS_DECLARATION_VERSION
        : null,
    submitterLikenessConsentAcceptedAt:
      parsed.submitterLikenessConsentAccepted === true ? now : null,
  };
}

async function consumeToken(
  prisma: PrismaClient,
  tokenHash: string,
  expiresAt: Date,
  input: ReceivePublicStorySubmissionInput,
  now: Date,
  auditWriter?: SubmissionAuditWriter,
  tokenUseWriter?: PublicStoryIntakeDependencies["tokenUseWriter"],
  media?: {
    readonly recoveryToken: string;
    readonly expectedAttemptVersion: number;
    readonly rightsDeclarationAccepted: boolean;
  },
) {
  return prisma.$transaction(async (transaction) => {
    const inserted = tokenUseWriter
      ? await tokenUseWriter(transaction, tokenHash, expiresAt, now)
      : await transaction.$executeRaw`
          INSERT INTO "public_story_intake_token_use"
            ("id", "tokenHash", "expiresAt", "consumedAt")
          VALUES
            (gen_random_uuid(), ${tokenHash}, ${expiresAt}, ${now})
          ON CONFLICT ("tokenHash") DO NOTHING
        `;
    if (inserted === 0) {
      return outcome("DUPLICATE_ACCEPTED", PUBLIC_STORY_INTAKE_SUCCESS_MESSAGE);
    }

    if (media) {
      const finalizable = await validateFinalizableSubmissionMediaInTransaction(
        transaction,
        media,
        now,
      );
      if (finalizable.mediaCount > 0 && !media.rightsDeclarationAccepted) {
        throw new ValidationError(
          "Image rights declaration is required when images are submitted.",
        );
      }
    }

    const internal = await receivePublicStorySubmissionInTransaction(
      transaction,
      input,
      { now: () => now, ...(auditWriter ? { auditWriter } : {}) },
    );
    if (media) {
      await associateReadySubmissionMediaInTransaction(
        transaction,
        { ...media, submissionId: internal.submissionId },
        now,
      );
    }
    await transaction.publicStoryIntakeTokenUse.update({
      where: { tokenHash },
      data: { submissionId: internal.submissionId },
    });
    return outcome("ACCEPTED", PUBLIC_STORY_INTAKE_SUCCESS_MESSAGE);
  });
}

export function issuePublicStorySubmissionFormToken(
  dependencies: Pick<PublicStoryIntakeDependencies, "config" | "now"> = {},
) {
  const config = configFrom(dependencies);
  if (!config.enabled || !config.secret || !config.privacyNoticeVersion) {
    return null;
  }
  return issuePublicStorySubmissionToken(
    {
      secret: config.secret,
      privacyNoticeVersion: config.privacyNoticeVersion,
    },
    dependencies.now?.() ?? new Date(),
  );
}

export async function submitPublicStorySubmission(
  formData: FormData,
  requestContext: PublicStoryIntakeRequestContext,
  dependencies: PublicStoryIntakeDependencies = {},
): Promise<PublicStoryIntakeOutcome> {
  const config = configFrom(dependencies);
  if (!config.enabled || !config.secret || !config.privacyNoticeVersion) {
    return outcome("UNAVAILABLE", PUBLIC_STORY_INTAKE_GENERIC_MESSAGE);
  }

  const database = dependencies.prisma ?? runtimePrisma;
  const now = dependencies.now?.() ?? new Date();
  const correlationId = randomUUID();

  try {
    if (dependencies.cleanupArtifacts !== false) {
      await cleanupExpiredPublicStoryIntakeArtifacts(database, now);
    }

    const networkAllowed = await database.$transaction((transaction) =>
      consumePublicStoryIntakeRateLimits(
        transaction,
        {
          networkIdentity:
            dependencies.networkIdentity ??
            networkIdentity(requestContext.headers, config),
        },
        config,
        now,
        dependencies.rateLimits,
      ),
    );
    if (!networkAllowed) {
      return outcome("RATE_LIMITED", PUBLIC_STORY_INTAKE_GENERIC_MESSAGE);
    }

    if (
      !validatePublicStorySubmissionRequestContext(
        requestContext.headers,
        config,
      )
    ) {
      return rejectedOutcome();
    }

    const parsed = parsePublicStorySubmissionForm(formData);
    if (parsed.kind !== "ok") return rejectedOutcome();

    const token = verifyPublicStorySubmissionToken(
      parsed.value.formToken,
      {
        secret: config.secret,
        privacyNoticeVersion: config.privacyNoticeVersion,
      },
      now,
    );
    if (!token) return rejectedOutcome();
    if (parsed.value.privacyNoticeVersion !== token.privacyNoticeVersion) {
      return rejectedOutcome();
    }
    if (!parsed.value.privacyNoticeAcknowledged) return rejectedOutcome();
    if (parsed.value.honeypot.trim() !== "") return rejectedOutcome();
    if (!completionTimeAllowsSubmission(token, now)) return rejectedOutcome();
    if (
      now.valueOf() - token.issuedAt.valueOf() <
      PUBLIC_STORY_INTAKE_MIN_COMPLETION_MS
    ) {
      return rejectedOutcome();
    }

    const candidate = formInput(parsed.value, token.privacyNoticeVersion, now);
    try {
      validateReceivePublicStorySubmissionInput(candidate);
    } catch (error) {
      if (error instanceof ValidationError) return validationOutcome(error);
      throw error;
    }

    const emailAllowed = await database.$transaction((transaction) =>
      consumePublicStoryIntakeRateLimits(
        transaction,
        {
          networkIdentity:
            dependencies.networkIdentity ??
            networkIdentity(requestContext.headers, config),
          normalizedEmail: candidate.submitterEmail.trim().toLowerCase(),
          includeNetwork: false,
          includeGlobal: false,
        },
        config,
        now,
        dependencies.rateLimits,
      ),
    );
    if (!emailAllowed) {
      return outcome("RATE_LIMITED", PUBLIC_STORY_INTAKE_GENERIC_MESSAGE);
    }

    try {
      return await consumeToken(
        database,
        hashPublicStorySubmissionToken(parsed.value.formToken),
        token.expiresAt,
        candidate,
        now,
        dependencies.auditWriter,
        dependencies.tokenUseWriter,
        parsed.value.mediaRecoveryToken
          ? {
              recoveryToken: parsed.value.mediaRecoveryToken,
              expectedAttemptVersion: parsed.value.mediaAttemptVersion!,
              rightsDeclarationAccepted:
                parsed.value.rightsDeclarationAccepted === true,
            }
          : undefined,
      );
    } catch (error) {
      if (error instanceof ValidationError) return validationOutcome(error);
      throw error;
    }
  } catch (error) {
    logger.error("public_story_submission.intake.unexpected_error", {
      correlationId,
      operation: "public_story_submission.intake",
      errorClass:
        error instanceof Error ? error.constructor.name : "UnknownError",
    });
    return outcome("UNAVAILABLE", PUBLIC_STORY_INTAKE_GENERIC_MESSAGE);
  }
}
