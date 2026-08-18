import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PublicStorySubmissionStatus } from "@/generated/prisma/client";
import {
  createStoryDraftInTransaction,
  storyDocumentFromPlainText,
} from "@/modules/communications/stories";
import { buildAuditEvent } from "@/platform/audit/event";
import type { AdminPrincipal } from "@/platform/auth/principal";
import {
  AuthorizationError,
  ConcurrencyError,
  NotFoundError,
  ValidationError,
} from "@/platform/errors/app-error";

type Transaction = Prisma.TransactionClient;
type ConversionActor = Pick<AdminPrincipal, "adminUserId" | "capabilities">;

const conversionSelect = {
  submissionId: true,
  storyId: true,
  sourceSubmissionVersion: true,
  convertedAt: true,
  convertedByAdminUserId: true,
  convertedBy: { select: { authUser: { select: { name: true } } } },
} satisfies Prisma.PublicStorySubmissionStoryConversionSelect;

type ConversionRecord = Prisma.PublicStorySubmissionStoryConversionGetPayload<{
  select: typeof conversionSelect;
}>;

export type PublicStorySubmissionStoryConversionState = Readonly<{
  converted: true;
  submissionId: string;
  storyId: string;
  sourceSubmissionVersion: number;
  convertedAt: Date;
  convertedByAdminUserId: string;
  convertedByDisplayName: string | null;
}>;

export type PublicStorySubmissionStoryConversionResult =
  PublicStorySubmissionStoryConversionState & Readonly<{ created: boolean }>;

function requireReviewCapability(actor: ConversionActor) {
  if (!actor.capabilities.includes("communications.submissions.review")) {
    throw new AuthorizationError();
  }
}

function requireConversionCapabilities(actor: ConversionActor) {
  if (
    !actor.capabilities.includes("communications.submissions.review") ||
    !actor.capabilities.includes("stories.create")
  ) {
    throw new AuthorizationError();
  }
}

function assertIdentifier(value: string, label: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new ValidationError(`${label} must be a valid identifier.`);
  }
}

function assertVersion(value: number) {
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError("Submission version must be a positive integer.");
  }
}

function safeConversionState(
  record: ConversionRecord,
): PublicStorySubmissionStoryConversionState {
  return {
    converted: true,
    submissionId: record.submissionId,
    storyId: record.storyId,
    sourceSubmissionVersion: record.sourceSubmissionVersion,
    convertedAt: record.convertedAt,
    convertedByAdminUserId: record.convertedByAdminUserId,
    convertedByDisplayName: record.convertedBy.authUser.name,
  };
}

function conversionCandidate(submission: {
  suggestedTitle: string | null;
  storyText: string;
}) {
  const headline =
    submission.suggestedTitle?.trim() || "Story draft from submission";
  const excerpt = submission.storyText
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
  return {
    headline,
    deck: null,
    excerpt:
      excerpt ||
      "Editorial draft sourced from a confidential Story Submission.",
    body: storyDocumentFromPlainText(submission.storyText),
  };
}

async function requireActiveAdmin(
  transaction: Transaction,
  adminUserId: string,
) {
  const admin = await transaction.adminUser.findFirst({
    where: { id: adminUserId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!admin) throw new AuthorizationError();
}

function isConcurrencyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: unknown }).code === "P2002" ||
      (error as { code?: unknown }).code === "P2025")
  );
}

async function findConversion(prisma: PrismaClient, submissionId: string) {
  return prisma.publicStorySubmissionStoryConversion.findUnique({
    where: { submissionId },
    select: conversionSelect,
  });
}

export async function getPublicStorySubmissionStoryConversion(
  prisma: PrismaClient,
  actor: ConversionActor,
  submissionId: string,
) {
  requireReviewCapability(actor);
  assertIdentifier(submissionId, "Submission ID");
  await requireActiveAdmin(prisma, actor.adminUserId);
  const conversion = await findConversion(prisma, submissionId);
  return conversion ? safeConversionState(conversion) : null;
}

export async function convertPublicStorySubmissionToStory(
  prisma: PrismaClient,
  actor: ConversionActor,
  input: Readonly<{
    submissionId: string;
    expectedVersion: number;
  }>,
): Promise<PublicStorySubmissionStoryConversionResult> {
  requireConversionCapabilities(actor);
  assertIdentifier(input.submissionId, "Submission ID");
  assertVersion(input.expectedVersion);
  const correlationId = randomUUID();

  try {
    const result = await prisma.$transaction(async (transaction) => {
      await requireActiveAdmin(transaction, actor.adminUserId);
      const submission = await transaction.publicStorySubmission.findUnique({
        where: { id: input.submissionId },
        select: {
          id: true,
          status: true,
          version: true,
          suggestedTitle: true,
          storyText: true,
          storyConversion: { select: conversionSelect },
        },
      });
      if (!submission)
        throw new NotFoundError("Story Submission was not found.");
      if (submission.storyConversion) {
        return {
          ...safeConversionState(submission.storyConversion),
          created: false,
        };
      }
      if (submission.status !== PublicStorySubmissionStatus.ACCEPTED) {
        throw new ValidationError(
          "Only an accepted Story Submission can start an editorial draft.",
        );
      }
      if (submission.version !== input.expectedVersion) {
        throw new ConcurrencyError();
      }

      const story = await createStoryDraftInTransaction(
        transaction,
        actor,
        conversionCandidate(submission),
        correlationId,
      );
      const conversion =
        await transaction.publicStorySubmissionStoryConversion.create({
          data: {
            submissionId: submission.id,
            storyId: story.storyId,
            sourceSubmissionVersion: submission.version,
            convertedByAdminUserId: actor.adminUserId,
            correlationId,
          },
          select: conversionSelect,
        });
      await transaction.auditEvent.create({
        data: buildAuditEvent({
          actorKind: "ADMIN_USER",
          actorAdminUserId: actor.adminUserId,
          action: "public_story_submission.story_created",
          targetType: "PublicStorySubmission",
          targetId: submission.id,
          correlationId,
          summary: {
            submissionId: submission.id,
            storyId: story.storyId,
            sourceSubmissionVersion: submission.version,
          },
        }),
      });
      return { ...safeConversionState(conversion), created: true };
    });
    return result;
  } catch (error) {
    if (isConcurrencyError(error)) {
      const existing = await findConversion(prisma, input.submissionId);
      if (existing) return { ...safeConversionState(existing), created: false };
      if (error instanceof ConcurrencyError) throw error;
      throw new ConcurrencyError();
    }
    throw error;
  }
}
