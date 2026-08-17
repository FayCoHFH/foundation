import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PublicStorySubmissionStatus } from "@/generated/prisma/client";
import { buildAuditEvent } from "@/platform/audit/event";
import type { Capability } from "@/platform/auth/capabilities";
import type { AdminPrincipal } from "@/platform/auth/principal";
import {
  AuthorizationError,
  ConcurrencyError,
  NotFoundError,
  ValidationError,
} from "@/platform/errors/app-error";

import {
  ADMIN_SUBMISSION_MAX_PAGE_SIZE,
  ADMIN_SUBMISSION_PAGE_SIZE,
  assertAllowedSubmissionTransition,
  assertAllowedSpamRestoration,
  type ReceivePublicStorySubmissionInput,
  validateInternalReviewNote,
  validateReceivePublicStorySubmissionInput,
  validateSubmissionPage,
} from "./submission-content";

type Transaction = Prisma.TransactionClient;
type SubmissionActor = Pick<AdminPrincipal, "adminUserId" | "capabilities">;

const detailSelect = {
  id: true,
  submitterName: true,
  submitterEmail: true,
  relationshipToHabitat: true,
  suggestedTitle: true,
  storyText: true,
  contactConsent: true,
  privacyNoticeVersion: true,
  privacyNoticeAcceptedAt: true,
  editorialReviewAcknowledged: true,
  sensitiveDataWarningAcknowledged: true,
  publicationInterest: true,
  involvesMinor: true,
  involvesHomeownerOrApplicant: true,
  containsSensitivePersonalCircumstances: true,
  status: true,
  internalReviewNote: true,
  version: true,
  receivedAt: true,
  statusChangedAt: true,
  createdAt: true,
  updatedAt: true,
  statusChangedBy: { select: { authUser: { select: { name: true } } } },
} satisfies Prisma.PublicStorySubmissionSelect;

const listSelect = {
  id: true,
  submitterName: true,
  relationshipToHabitat: true,
  suggestedTitle: true,
  status: true,
  involvesMinor: true,
  involvesHomeownerOrApplicant: true,
  containsSensitivePersonalCircumstances: true,
  receivedAt: true,
  updatedAt: true,
  statusChangedAt: true,
  version: true,
} satisfies Prisma.PublicStorySubmissionSelect;

type DetailRecord = Prisma.PublicStorySubmissionGetPayload<{
  select: typeof detailSelect;
}>;
type ListRecord = Prisma.PublicStorySubmissionGetPayload<{
  select: typeof listSelect;
}>;

export type PublicStorySubmissionAdminDetail = Readonly<{
  id: string;
  submitterName: string;
  submitterEmail: string;
  relationshipToHabitat: string;
  suggestedTitle: string | null;
  storyText: string;
  contactConsent: boolean;
  privacyNoticeVersion: string;
  privacyNoticeAcceptedAt: Date;
  editorialReviewAcknowledged: boolean;
  sensitiveDataWarningAcknowledged: boolean;
  publicationInterest: boolean | null;
  involvesMinor: boolean;
  involvesHomeownerOrApplicant: boolean;
  containsSensitivePersonalCircumstances: boolean;
  status: PublicStorySubmissionStatus;
  internalReviewNote: string | null;
  version: number;
  receivedAt: Date;
  statusChangedAt: Date;
  statusChangedByDisplayName: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type PublicStorySubmissionAdminListItem = Readonly<{
  id: string;
  submitterName: string;
  relationshipToHabitat: string;
  suggestedTitle: string | null;
  status: PublicStorySubmissionStatus;
  involvesMinor: boolean;
  involvesHomeownerOrApplicant: boolean;
  containsSensitivePersonalCircumstances: boolean;
  receivedAt: Date;
  updatedAt: Date;
  statusChangedAt: Date;
  version: number;
}>;

export type PublicStorySubmissionReceiveResult = Readonly<{
  status: "RECEIVED";
  receivedAt: Date;
}>;

export type PublicStorySubmissionInternalReceiveResult = Readonly<{
  submissionId: string;
  result: PublicStorySubmissionReceiveResult;
}>;

export type SubmissionAuditWriter = (
  transaction: Transaction,
  data: Prisma.AuditEventUncheckedCreateInput,
) => Promise<void>;

export type SubmissionMutationDependencies = Readonly<{
  auditWriter?: SubmissionAuditWriter;
  now?: () => Date;
}>;

const writeAudit: SubmissionAuditWriter = async (transaction, data) => {
  await transaction.auditEvent.create({ data });
};

function requireCapability(actor: SubmissionActor) {
  requireCapabilities(actor, ["communications.submissions.review"]);
}

function requireCapabilities(
  actor: SubmissionActor,
  capabilities: readonly Capability[],
) {
  if (
    capabilities.some((capability) => !actor.capabilities.includes(capability))
  ) {
    throw new AuthorizationError();
  }
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

async function requireActiveAdminOnClient(
  prisma: PrismaClient,
  adminUserId: string,
) {
  const admin = await prisma.adminUser.findFirst({
    where: { id: adminUserId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!admin) throw new AuthorizationError();
}

function assertIdentifier(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new ValidationError("Submission ID must be a valid identifier.");
  }
}

function assertVersion(value: number) {
  if (!Number.isInteger(value) || value < 1)
    throw new ValidationError("Submission version must be a positive integer.");
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

async function runMutation<T>(
  prisma: PrismaClient,
  operation: (transaction: Transaction) => Promise<T>,
) {
  try {
    return await prisma.$transaction(operation);
  } catch (error) {
    if (isConcurrencyError(error)) throw new ConcurrencyError();
    throw error;
  }
}

function toDetail(record: DetailRecord): PublicStorySubmissionAdminDetail {
  return {
    id: record.id,
    submitterName: record.submitterName,
    submitterEmail: record.submitterEmail,
    relationshipToHabitat: record.relationshipToHabitat,
    suggestedTitle: record.suggestedTitle,
    storyText: record.storyText,
    contactConsent: record.contactConsent,
    privacyNoticeVersion: record.privacyNoticeVersion,
    privacyNoticeAcceptedAt: record.privacyNoticeAcceptedAt,
    editorialReviewAcknowledged: record.editorialReviewAcknowledged,
    sensitiveDataWarningAcknowledged: record.sensitiveDataWarningAcknowledged,
    publicationInterest: record.publicationInterest,
    involvesMinor: record.involvesMinor,
    involvesHomeownerOrApplicant: record.involvesHomeownerOrApplicant,
    containsSensitivePersonalCircumstances:
      record.containsSensitivePersonalCircumstances,
    status: record.status,
    internalReviewNote: record.internalReviewNote,
    version: record.version,
    receivedAt: record.receivedAt,
    statusChangedAt: record.statusChangedAt,
    statusChangedByDisplayName: record.statusChangedBy?.authUser.name ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toList(record: ListRecord): PublicStorySubmissionAdminListItem {
  return record;
}

async function findDetail(transaction: Transaction, id: string) {
  assertIdentifier(id);
  const record = await transaction.publicStorySubmission.findUnique({
    where: { id },
    select: detailSelect,
  });
  if (!record) throw new NotFoundError("Story submission was not found.");
  return record;
}

export async function receivePublicStorySubmissionInTransaction(
  transaction: Transaction,
  input: ReceivePublicStorySubmissionInput,
  dependencies: SubmissionMutationDependencies = {},
): Promise<PublicStorySubmissionInternalReceiveResult> {
  const validated = validateReceivePublicStorySubmissionInput(input);
  const now = dependencies.now?.() ?? new Date();
  const created = await transaction.publicStorySubmission.create({
    data: {
      ...validated,
      receivedAt: now,
      statusChangedAt: now,
      version: 1,
    },
    select: { id: true, receivedAt: true, version: true },
  });
  await (dependencies.auditWriter ?? writeAudit)(
    transaction,
    buildAuditEvent({
      actorKind: "SYSTEM",
      action: "public_story_submission.received",
      targetType: "PublicStorySubmission",
      targetId: created.id,
      correlationId: randomUUID(),
      summary: { status: "RECEIVED", version: created.version },
    }),
  );
  return {
    submissionId: created.id,
    result: {
      status: PublicStorySubmissionStatus.RECEIVED,
      receivedAt: created.receivedAt,
    },
  };
}

export async function receivePublicStorySubmission(
  prisma: PrismaClient,
  input: ReceivePublicStorySubmissionInput,
  dependencies: SubmissionMutationDependencies = {},
): Promise<PublicStorySubmissionReceiveResult> {
  const internal = await runMutation(prisma, (transaction) =>
    receivePublicStorySubmissionInTransaction(transaction, input, dependencies),
  );
  return internal.result;
}

export async function listPublicStorySubmissions(
  prisma: PrismaClient,
  actor: SubmissionActor,
  input: Readonly<{
    status?: PublicStorySubmissionStatus;
    page?: number;
    pageSize?: number;
  }> = {},
) {
  requireCapability(actor);
  await requireActiveAdminOnClient(prisma, actor.adminUserId);
  if (
    input.status &&
    !Object.values(PublicStorySubmissionStatus).includes(input.status)
  ) {
    throw new ValidationError("Submission status is not supported.");
  }
  const page = validateSubmissionPage(
    input.page,
    "Page",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const pageSize = validateSubmissionPage(
    input.pageSize,
    "Page size",
    ADMIN_SUBMISSION_PAGE_SIZE,
    ADMIN_SUBMISSION_MAX_PAGE_SIZE,
  );
  const where = input.status ? { status: input.status } : {};
  const [records, total] = await Promise.all([
    prisma.publicStorySubmission.findMany({
      where,
      select: listSelect,
      orderBy: [{ receivedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.publicStorySubmission.count({ where }),
  ]);
  return { items: records.map(toList), page, pageSize, total };
}

export async function getPublicStorySubmissionDetail(
  prisma: PrismaClient,
  actor: SubmissionActor,
  submissionId: string,
) {
  requireCapability(actor);
  await requireActiveAdminOnClient(prisma, actor.adminUserId);
  return toDetail(await findDetail(prisma, submissionId));
}

async function transitionSubmission(
  prisma: PrismaClient,
  actor: SubmissionActor,
  submissionId: string,
  expectedVersion: number,
  nextStatus: PublicStorySubmissionStatus,
  action: string,
  dependencies: SubmissionMutationDependencies,
  requiredCapabilities: readonly Capability[] = [
    "communications.submissions.review",
  ],
  transitionValidator: (
    from: PublicStorySubmissionStatus,
    to: PublicStorySubmissionStatus,
  ) => void = assertAllowedSubmissionTransition,
) {
  requireCapabilities(actor, requiredCapabilities);
  assertVersion(expectedVersion);
  const now = dependencies.now?.() ?? new Date();
  return runMutation(prisma, async (transaction) => {
    await requireActiveAdmin(transaction, actor.adminUserId);
    const current = await findDetail(transaction, submissionId);
    if (current.version !== expectedVersion) throw new ConcurrencyError();
    transitionValidator(current.status, nextStatus);
    try {
      await transaction.publicStorySubmission.update({
        where: { id_version: { id: submissionId, version: expectedVersion } },
        data: {
          status: nextStatus,
          statusChangedAt: now,
          statusChangedByAdminUserId: actor.adminUserId,
          version: { increment: 1 },
        },
      });
    } catch (error) {
      if (isConcurrencyError(error)) throw new ConcurrencyError();
      throw error;
    }
    await (dependencies.auditWriter ?? writeAudit)(
      transaction,
      buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action,
        targetType: "PublicStorySubmission",
        targetId: submissionId,
        correlationId: randomUUID(),
        summary: {
          fromStatus: current.status,
          toStatus: nextStatus,
          version: expectedVersion + 1,
        },
      }),
    );
    return toDetail(await findDetail(transaction, submissionId));
  });
}

export const beginPublicStorySubmissionReview = (
  prisma: PrismaClient,
  actor: SubmissionActor,
  id: string,
  version: number,
  dependencies: SubmissionMutationDependencies = {},
) =>
  transitionSubmission(
    prisma,
    actor,
    id,
    version,
    PublicStorySubmissionStatus.IN_REVIEW,
    "public_story_submission.review_started",
    dependencies,
  );
export const markPublicStorySubmissionFollowUp = (
  prisma: PrismaClient,
  actor: SubmissionActor,
  id: string,
  version: number,
  dependencies: SubmissionMutationDependencies = {},
) =>
  transitionSubmission(
    prisma,
    actor,
    id,
    version,
    PublicStorySubmissionStatus.FOLLOW_UP,
    "public_story_submission.follow_up_requested",
    dependencies,
  );
export const acceptPublicStorySubmission = (
  prisma: PrismaClient,
  actor: SubmissionActor,
  id: string,
  version: number,
  dependencies: SubmissionMutationDependencies = {},
) =>
  transitionSubmission(
    prisma,
    actor,
    id,
    version,
    PublicStorySubmissionStatus.ACCEPTED,
    "public_story_submission.accepted",
    dependencies,
  );
export const declinePublicStorySubmission = (
  prisma: PrismaClient,
  actor: SubmissionActor,
  id: string,
  version: number,
  dependencies: SubmissionMutationDependencies = {},
) =>
  transitionSubmission(
    prisma,
    actor,
    id,
    version,
    PublicStorySubmissionStatus.DECLINED,
    "public_story_submission.declined",
    dependencies,
  );
export const markPublicStorySubmissionSpam = (
  prisma: PrismaClient,
  actor: SubmissionActor,
  id: string,
  version: number,
  dependencies: SubmissionMutationDependencies = {},
) =>
  transitionSubmission(
    prisma,
    actor,
    id,
    version,
    PublicStorySubmissionStatus.SPAM,
    "public_story_submission.marked_spam",
    dependencies,
  );

export const restoreSpamPublicStorySubmission = (
  prisma: PrismaClient,
  actor: SubmissionActor,
  id: string,
  version: number,
  dependencies: SubmissionMutationDependencies = {},
) =>
  transitionSubmission(
    prisma,
    actor,
    id,
    version,
    PublicStorySubmissionStatus.RECEIVED,
    "public_story_submission.spam_restored",
    dependencies,
    [
      "communications.submissions.review",
      "communications.submissions.restore_spam",
    ],
    assertAllowedSpamRestoration,
  );

export async function updatePublicStorySubmissionReviewNote(
  prisma: PrismaClient,
  actor: SubmissionActor,
  input: Readonly<{
    submissionId: string;
    expectedVersion: number;
    internalReviewNote?: string | null;
  }>,
  dependencies: SubmissionMutationDependencies = {},
) {
  requireCapability(actor);
  assertVersion(input.expectedVersion);
  const note = validateInternalReviewNote(input.internalReviewNote);
  return runMutation(prisma, async (transaction) => {
    await requireActiveAdmin(transaction, actor.adminUserId);
    const current = await findDetail(transaction, input.submissionId);
    if (current.version !== input.expectedVersion) throw new ConcurrencyError();
    try {
      await transaction.publicStorySubmission.update({
        where: {
          id_version: {
            id: input.submissionId,
            version: input.expectedVersion,
          },
        },
        data: { internalReviewNote: note, version: { increment: 1 } },
      });
    } catch (error) {
      if (isConcurrencyError(error)) throw new ConcurrencyError();
      throw error;
    }
    await (dependencies.auditWriter ?? writeAudit)(
      transaction,
      buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action: "public_story_submission.review_note_updated",
        targetType: "PublicStorySubmission",
        targetId: input.submissionId,
        correlationId: randomUUID(),
        summary: { version: input.expectedVersion + 1 },
      }),
    );
    return toDetail(await findDetail(transaction, input.submissionId));
  });
}
