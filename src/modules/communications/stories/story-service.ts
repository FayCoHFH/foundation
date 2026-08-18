import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type {
  PublicationLifecycleAction,
  PublicationWorkflowState,
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

import {
  hashStoryCandidate,
  STORY_CONTENT_HASH_VERSION,
  type StoryCandidate,
  type StoryDocument,
  validateStoryCandidate,
  validateStoryDocument,
} from "./content";
import { nextStoryWorkflowState, type StoryWorkflowAction } from "./workflow";

const storyDraftInclude = {
  publication: {
    include: {
      responsibility: true,
      currentRevision: true,
      approvedRevision: { include: { approval: true } },
      snapshots: { select: { id: true }, orderBy: { activatedAt: "desc" } },
    },
  },
} satisfies Prisma.StoryInclude;

type StoryRecord = Prisma.StoryGetPayload<{
  include: typeof storyDraftInclude;
}>;
type Transaction = Prisma.TransactionClient;
type StoryActor = Pick<AdminPrincipal, "adminUserId" | "capabilities">;

export type PersistedStoryDraft = Readonly<{
  storyId: string;
  publicationId: string;
  version: number;
  workflow: PublicationWorkflowState;
  releaseState: "UNPUBLISHED" | "PUBLISHED" | "WITHDRAWN";
  slug: string | null;
  snapshotCount: number;
  editorialOwnerAdminUserId: string;
  currentRevision: Readonly<{
    id: string;
    number: number;
    headline: string;
    deck: string | null;
    excerpt: string;
    body: StoryDocument;
    schemaVersion: number;
    contentHash: string;
    createdByAdminUserId: string;
    createdAt: Date;
  }>;
  approval: Readonly<{
    revisionId: string;
    contentHash: string;
    approvedByAdminUserId: string;
    approvedAt: Date;
  }> | null;
}>;

export type CreateStoryInput = StoryCandidate & {
  editorialOwnerAdminUserId?: string;
};

export type SaveStoryRevisionInput = StoryCandidate & {
  storyId: string;
  expectedVersion: number;
};

export type StoryWorkflowInput = Readonly<{
  storyId: string;
  expectedVersion: number;
  expectedContentHash: string;
  reason?: string;
}>;

export type StoryReleaseInput = StoryWorkflowInput & { slug: string };
export type StoryWithdrawalInput = Readonly<{
  storyId: string;
  expectedVersion: number;
  reason: string;
}>;

export type PublicStory = Readonly<{
  slug: string;
  headline: string;
  deck: string | null;
  excerpt: string;
  body: StoryDocument;
  publishedAt: Date;
}>;

export type AssignStoryOwnerInput = Readonly<{
  storyId: string;
  expectedVersion: number;
  editorialOwnerAdminUserId: string;
  reason: string;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertIdentifier(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new ValidationError(`${label} must be a valid identifier.`);
  }
}

function assertExpectedVersion(value: number) {
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError("Story version must be a positive integer.");
  }
}

function normalizedSlug(value: string) {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160) {
    throw new ValidationError(
      "Use a canonical URL slug with lowercase letters, numbers, and hyphens.",
    );
  }
  return slug;
}

function requireCapability(actor: StoryActor, capability: Capability) {
  if (!actor.capabilities.includes(capability)) throw new AuthorizationError();
}

async function requireActiveAdmin(
  transaction: Transaction,
  adminUserId: string,
) {
  const adminUser = await transaction.adminUser.findFirst({
    where: { id: adminUserId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!adminUser) throw new AuthorizationError();
}

function currentRevision(record: StoryRecord) {
  if (!record.publication.currentRevision) {
    throw new PreconditionError("This Story does not have a current revision.");
  }
  return record.publication.currentRevision;
}

function responsibility(record: StoryRecord) {
  if (!record.publication.responsibility) {
    throw new PreconditionError(
      "This Story does not have editorial responsibility.",
    );
  }
  return record.publication.responsibility;
}

function toDraft(record: StoryRecord): PersistedStoryDraft {
  const revision = currentRevision(record);
  const owner = responsibility(record);
  const approval = record.publication.approvedRevision?.approval;
  return {
    storyId: record.id,
    publicationId: record.publicationId,
    version: record.publication.version,
    workflow: record.publication.workflowState,
    releaseState: record.publication.releaseState,
    slug: record.publication.slug,
    snapshotCount: record.publication.snapshots.length,
    editorialOwnerAdminUserId: owner.editorialOwnerAdminUserId,
    currentRevision: {
      id: revision.id,
      number: revision.number,
      headline: revision.headline,
      deck: revision.deck,
      excerpt: revision.excerpt,
      body: validateStoryDocument(revision.body),
      schemaVersion: revision.schemaVersion,
      contentHash: revision.contentHash,
      createdByAdminUserId: revision.createdByAdminUserId,
      createdAt: revision.createdAt,
    },
    approval: approval
      ? {
          revisionId: approval.revisionId,
          contentHash: approval.contentHash,
          approvedByAdminUserId: approval.approvedByAdminUserId,
          approvedAt: approval.approvedAt,
        }
      : null,
  };
}

async function findStory(transaction: Transaction, storyId: string) {
  assertIdentifier(storyId, "Story ID");
  const story = await transaction.story.findUnique({
    where: { id: storyId },
    include: storyDraftInclude,
  });
  if (!story) throw new NotFoundError("Story draft was not found.");
  return story;
}

function assertReadable(actor: StoryActor, record: StoryRecord) {
  if (actor.capabilities.includes("stories.read.draft.any")) return;
  if (
    actor.capabilities.includes("stories.read.draft.own") &&
    responsibility(record).editorialOwnerAdminUserId === actor.adminUserId
  ) {
    return;
  }
  throw new AuthorizationError();
}

function assertEditable(actor: StoryActor, record: StoryRecord) {
  if (actor.capabilities.includes("stories.edit.any")) return;
  if (
    actor.capabilities.includes("stories.edit.own") &&
    responsibility(record).editorialOwnerAdminUserId === actor.adminUserId
  ) {
    return;
  }
  throw new AuthorizationError();
}

function assertVersion(record: StoryRecord, expectedVersion: number) {
  assertExpectedVersion(expectedVersion);
  if (record.publication.version !== expectedVersion) {
    throw new ConcurrencyError();
  }
}

async function findStoryForMutation(
  transaction: Transaction,
  storyId: string,
  expectedVersion: number,
) {
  assertIdentifier(storyId, "Story ID");
  assertExpectedVersion(expectedVersion);
  const story = await findStory(transaction, storyId);
  assertVersion(story, expectedVersion);
  return story;
}

function assertCurrentHash(record: StoryRecord, expectedContentHash: string) {
  const revision = currentRevision(record);
  if (revision.contentHash !== expectedContentHash) {
    throw new PreconditionError(
      "The Story candidate changed. Reload the draft before continuing.",
    );
  }
}

async function createLifecycleTransition(
  transaction: Transaction,
  input: Readonly<{
    publicationId: string;
    dimension?:
      "CANDIDATE_WORKFLOW" | "RELEASE_SNAPSHOT" | "DISCOVERY_DISPOSITION";
    action: PublicationLifecycleAction;
    fromState: PublicationWorkflowState | null;
    toState: PublicationWorkflowState | null;
    revisionId: string;
    contentHash: string;
    actorAdminUserId: string;
    correlationId: string;
    reason?: string;
  }>,
) {
  await transaction.publicationLifecycleTransition.create({
    data: {
      publicationId: input.publicationId,
      dimension: input.dimension ?? "CANDIDATE_WORKFLOW",
      action: input.action,
      fromState: input.fromState,
      toState: input.toState,
      revisionId: input.revisionId,
      contentHash: input.contentHash,
      actorAdminUserId: input.actorAdminUserId,
      ...(input.reason ? { reason: input.reason } : {}),
      correlationId: input.correlationId,
    },
  });
}

async function createAudit(
  transaction: Transaction,
  actorAdminUserId: string,
  action: string,
  storyId: string,
  correlationId: string,
  summary: Readonly<Record<string, string | number | boolean | null>>,
) {
  await transaction.auditEvent.create({
    data: buildAuditEvent({
      actorKind: "ADMIN_USER",
      actorAdminUserId,
      action,
      targetType: "Story",
      targetId: storyId,
      correlationId,
      summary,
    }),
  });
}

function transitionAction(
  action: StoryWorkflowAction,
): PublicationLifecycleAction {
  switch (action) {
    case "SUBMIT":
      return "SUBMITTED";
    case "REQUEST_CHANGES":
      return "CHANGES_REQUESTED";
    case "SEND_FOR_APPROVAL":
      return "SENT_FOR_APPROVAL";
    case "APPROVE":
      return "APPROVED";
  }
}

function auditAction(action: StoryWorkflowAction) {
  switch (action) {
    case "SUBMIT":
      return "story.submit";
    case "REQUEST_CHANGES":
      return "story.review.request_changes";
    case "SEND_FOR_APPROVAL":
      return "story.review.send_for_approval";
    case "APPROVE":
      return "story.approve";
  }
}

function normalizedReason(value: string | undefined, required: boolean) {
  const reason = value?.trim() ?? "";
  if (required && reason.length < 3) {
    throw new ValidationError("Provide a brief reason for requested changes.");
  }
  if (reason.length > 1_000) {
    throw new ValidationError("The workflow reason is too long.");
  }
  return reason || undefined;
}

function isPrismaConcurrencyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: unknown }).code === "P2002" ||
      (error as { code?: unknown }).code === "P2025")
  );
}

async function updatePublicationAtVersion(
  transaction: Transaction,
  publicationId: string,
  expectedVersion: number,
  data: Prisma.PublicationUpdateInput | Prisma.PublicationUncheckedUpdateInput,
) {
  try {
    await transaction.publication.update({
      where: { id_version: { id: publicationId, version: expectedVersion } },
      data: {
        ...data,
        version: { increment: 1 },
      } as Prisma.PublicationUpdateInput,
    });
  } catch (error) {
    if (isPrismaConcurrencyError(error)) throw new ConcurrencyError();
    throw error;
  }
}

async function runMutation<T>(
  prisma: PrismaClient,
  operation: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(operation);
  } catch (error) {
    if (isPrismaConcurrencyError(error)) throw new ConcurrencyError();
    throw error;
  }
}

export async function createStoryDraftInTransaction(
  transaction: Transaction,
  actor: StoryActor,
  input: CreateStoryInput,
  correlationId = randomUUID(),
): Promise<PersistedStoryDraft> {
  requireCapability(actor, "stories.create");
  const candidate = validateStoryCandidate(input);
  await requireActiveAdmin(transaction, actor.adminUserId);
  const ownerId = input.editorialOwnerAdminUserId ?? actor.adminUserId;
  assertIdentifier(ownerId, "Editorial owner ID");
  if (ownerId !== actor.adminUserId)
    requireCapability(actor, "stories.edit.any");
  await requireActiveAdmin(transaction, ownerId);

  const publication = await transaction.publication.create({
    data: {
      kind: "STORY",
      createdById: actor.adminUserId,
      story: { create: {} },
      responsibility: {
        create: {
          editorialOwnerAdminUserId: ownerId,
          changedByAdminUserId: actor.adminUserId,
        },
      },
    },
    include: { story: true },
  });
  const story = publication.story;
  if (!story) throw new Error("Story root was not created.");
  const contentHash = hashStoryCandidate(candidate);
  const revision = await transaction.publicationRevision.create({
    data: {
      publicationId: publication.id,
      number: 1,
      headline: candidate.headline,
      deck: candidate.deck,
      excerpt: candidate.excerpt,
      body: candidate.body as Prisma.InputJsonValue,
      schemaVersion: candidate.body.schemaVersion,
      contentHash,
      contentHashVersion: STORY_CONTENT_HASH_VERSION,
      createdByAdminUserId: actor.adminUserId,
    },
  });
  await transaction.publication.update({
    where: { id: publication.id },
    data: { currentRevisionId: revision.id },
  });
  await createLifecycleTransition(transaction, {
    publicationId: publication.id,
    action: "DRAFT_CREATED",
    fromState: null,
    toState: "DRAFT",
    revisionId: revision.id,
    contentHash,
    actorAdminUserId: actor.adminUserId,
    correlationId,
  });
  await createAudit(
    transaction,
    actor.adminUserId,
    "story.create",
    story.id,
    correlationId,
    {
      revisionNumber: 1,
      workflow: "DRAFT",
      ownerAssignedToCreator: ownerId === actor.adminUserId,
    },
  );
  return toDraft(await findStory(transaction, story.id));
}

export async function createStory(
  prisma: PrismaClient,
  actor: StoryActor,
  input: CreateStoryInput,
): Promise<PersistedStoryDraft> {
  return runMutation(prisma, (transaction) =>
    createStoryDraftInTransaction(transaction, actor, input),
  );
}

export async function getStoryDraft(
  prisma: PrismaClient,
  actor: StoryActor,
  storyId: string,
): Promise<PersistedStoryDraft> {
  return runMutation(prisma, async (transaction) => {
    await requireActiveAdmin(transaction, actor.adminUserId);
    const story = await findStory(transaction, storyId);
    assertReadable(actor, story);
    return toDraft(story);
  });
}

export async function saveStoryRevision(
  prisma: PrismaClient,
  actor: StoryActor,
  input: SaveStoryRevisionInput,
): Promise<PersistedStoryDraft> {
  const candidate = validateStoryCandidate(input);
  const correlationId = randomUUID();
  return runMutation(prisma, async (transaction) => {
    await requireActiveAdmin(transaction, actor.adminUserId);
    const story = await findStoryForMutation(
      transaction,
      input.storyId,
      input.expectedVersion,
    );
    assertEditable(actor, story);
    const prior = currentRevision(story);
    const contentHash = hashStoryCandidate(candidate);
    const revision = await transaction.publicationRevision.create({
      data: {
        publicationId: story.publicationId,
        number: prior.number + 1,
        parentRevisionId: prior.id,
        headline: candidate.headline,
        deck: candidate.deck,
        excerpt: candidate.excerpt,
        body: candidate.body as Prisma.InputJsonValue,
        schemaVersion: candidate.body.schemaVersion,
        contentHash,
        contentHashVersion: STORY_CONTENT_HASH_VERSION,
        createdByAdminUserId: actor.adminUserId,
      },
    });
    await updatePublicationAtVersion(
      transaction,
      story.publicationId,
      input.expectedVersion,
      {
        workflowState: "DRAFT",
        approvedContentHash: null,
        currentRevision: { connect: { id: revision.id } },
        approvedRevision: { disconnect: true },
      },
    );
    await createLifecycleTransition(transaction, {
      publicationId: story.publicationId,
      dimension: "RELEASE_SNAPSHOT",
      action: "REVISION_CREATED",
      fromState: story.publication.workflowState,
      toState: "DRAFT",
      revisionId: revision.id,
      contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
    });
    await createAudit(
      transaction,
      actor.adminUserId,
      "story.revision.create",
      story.id,
      correlationId,
      {
        revisionNumber: revision.number,
        priorWorkflow: story.publication.workflowState,
        approvalInvalidated: story.publication.approvedRevisionId !== null,
      },
    );
    return toDraft(await findStory(transaction, story.id));
  });
}

async function performWorkflowAction(
  prisma: PrismaClient,
  actor: StoryActor,
  action: Exclude<StoryWorkflowAction, "APPROVE">,
  input: StoryWorkflowInput,
): Promise<PersistedStoryDraft> {
  const correlationId = randomUUID();
  return runMutation(prisma, async (transaction) => {
    await requireActiveAdmin(transaction, actor.adminUserId);
    const story = await findStoryForMutation(
      transaction,
      input.storyId,
      input.expectedVersion,
    );
    assertCurrentHash(story, input.expectedContentHash);
    const revision = currentRevision(story);
    if (action === "SUBMIT") {
      requireCapability(actor, "stories.submit");
      if (
        responsibility(story).editorialOwnerAdminUserId !== actor.adminUserId &&
        !actor.capabilities.includes("stories.edit.any")
      ) {
        throw new AuthorizationError();
      }
    } else {
      requireCapability(actor, "stories.review");
    }
    const reason = normalizedReason(input.reason, action === "REQUEST_CHANGES");
    const nextState = nextStoryWorkflowState(
      story.publication.workflowState,
      action,
    );
    await updatePublicationAtVersion(
      transaction,
      story.publicationId,
      input.expectedVersion,
      { workflowState: nextState },
    );
    await createLifecycleTransition(transaction, {
      publicationId: story.publicationId,
      action: transitionAction(action),
      fromState: story.publication.workflowState,
      toState: nextState,
      revisionId: revision.id,
      contentHash: revision.contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
      ...(reason ? { reason } : {}),
    });
    await createAudit(
      transaction,
      actor.adminUserId,
      auditAction(action),
      story.id,
      correlationId,
      {
        revisionNumber: revision.number,
        fromWorkflow: story.publication.workflowState,
        toWorkflow: nextState,
        contentHash: revision.contentHash,
      },
    );
    return toDraft(await findStory(transaction, story.id));
  });
}

export function submitStory(
  prisma: PrismaClient,
  actor: StoryActor,
  input: StoryWorkflowInput,
) {
  return performWorkflowAction(prisma, actor, "SUBMIT", input);
}

export function requestStoryChanges(
  prisma: PrismaClient,
  actor: StoryActor,
  input: StoryWorkflowInput,
) {
  return performWorkflowAction(prisma, actor, "REQUEST_CHANGES", input);
}

export function sendStoryForApproval(
  prisma: PrismaClient,
  actor: StoryActor,
  input: StoryWorkflowInput,
) {
  return performWorkflowAction(prisma, actor, "SEND_FOR_APPROVAL", input);
}

export async function approveStory(
  prisma: PrismaClient,
  actor: StoryActor,
  input: StoryWorkflowInput,
): Promise<PersistedStoryDraft> {
  const correlationId = randomUUID();
  return runMutation(prisma, async (transaction) => {
    await requireActiveAdmin(transaction, actor.adminUserId);
    requireCapability(actor, "stories.approve");
    const story = await findStoryForMutation(
      transaction,
      input.storyId,
      input.expectedVersion,
    );
    assertCurrentHash(story, input.expectedContentHash);
    const revision = currentRevision(story);
    const nextState = nextStoryWorkflowState(
      story.publication.workflowState,
      "APPROVE",
    );
    const materialContribution =
      await transaction.publicationRevision.findFirst({
        where: {
          publicationId: story.publicationId,
          createdByAdminUserId: actor.adminUserId,
        },
        select: { id: true },
      });
    if (
      materialContribution ||
      story.publication.createdById === actor.adminUserId ||
      responsibility(story).editorialOwnerAdminUserId === actor.adminUserId
    ) {
      throw new AuthorizationError(
        "A creator, owner, or material editor cannot approve this Story candidate.",
      );
    }
    await transaction.publicationApproval.create({
      data: {
        publicationId: story.publicationId,
        revisionId: revision.id,
        contentHash: revision.contentHash,
        contentHashVersion: STORY_CONTENT_HASH_VERSION,
        approvedByAdminUserId: actor.adminUserId,
      },
    });
    await updatePublicationAtVersion(
      transaction,
      story.publicationId,
      input.expectedVersion,
      {
        workflowState: nextState,
        approvedContentHash: revision.contentHash,
        approvedRevision: { connect: { id: revision.id } },
      },
    );
    await createLifecycleTransition(transaction, {
      publicationId: story.publicationId,
      action: "APPROVED",
      fromState: story.publication.workflowState,
      toState: nextState,
      revisionId: revision.id,
      contentHash: revision.contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
    });
    await createAudit(
      transaction,
      actor.adminUserId,
      "story.approve",
      story.id,
      correlationId,
      {
        revisionNumber: revision.number,
        contentHash: revision.contentHash,
        policyVersion: 1,
        selfApprovalOverride: false,
      },
    );
    return toDraft(await findStory(transaction, story.id));
  });
}

export async function assignStoryEditorialOwner(
  prisma: PrismaClient,
  actor: StoryActor,
  input: AssignStoryOwnerInput,
): Promise<PersistedStoryDraft> {
  requireCapability(actor, "stories.edit.any");
  assertIdentifier(input.editorialOwnerAdminUserId, "Editorial owner ID");
  assertExpectedVersion(input.expectedVersion);
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 1_000) {
    throw new ValidationError(
      "Owner reassignment requires a reason between 3 and 1000 characters.",
    );
  }
  const correlationId = randomUUID();
  return runMutation(prisma, async (transaction) => {
    await requireActiveAdmin(transaction, actor.adminUserId);
    await requireActiveAdmin(transaction, input.editorialOwnerAdminUserId);
    const story = await findStoryForMutation(
      transaction,
      input.storyId,
      input.expectedVersion,
    );
    const current = responsibility(story);
    await transaction.publicationResponsibility.update({
      where: { publicationId: story.publicationId },
      data: {
        editorialOwnerAdminUserId: input.editorialOwnerAdminUserId,
        changedByAdminUserId: actor.adminUserId,
        reassignmentReason: reason,
      },
    });
    await updatePublicationAtVersion(
      transaction,
      story.publicationId,
      input.expectedVersion,
      {},
    );
    const revision = currentRevision(story);
    await createLifecycleTransition(transaction, {
      publicationId: story.publicationId,
      action: "OWNER_ASSIGNED",
      fromState: story.publication.workflowState,
      toState: story.publication.workflowState,
      revisionId: revision.id,
      contentHash: revision.contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
      reason,
    });
    await createAudit(
      transaction,
      actor.adminUserId,
      "story.owner.assign",
      story.id,
      correlationId,
      {
        revisionNumber: revision.number,
        changedOwner:
          current.editorialOwnerAdminUserId !== input.editorialOwnerAdminUserId,
      },
    );
    return toDraft(await findStory(transaction, story.id));
  });
}

/** Release is the sole authoring-to-public boundary. The projection receives
 * values copied from the approved revision; public reads never join revisions. */
export async function releaseStory(
  prisma: PrismaClient,
  actor: StoryActor,
  input: StoryReleaseInput,
): Promise<PersistedStoryDraft> {
  requireCapability(actor, "stories.publish");
  const slug = normalizedSlug(input.slug);
  const correlationId = randomUUID();
  return runMutation(prisma, async (transaction) => {
    await requireActiveAdmin(transaction, actor.adminUserId);
    const story = await findStoryForMutation(
      transaction,
      input.storyId,
      input.expectedVersion,
    );
    assertCurrentHash(story, input.expectedContentHash);
    const revision = currentRevision(story);
    const approval = story.publication.approvedRevision?.approval;
    if (
      story.publication.workflowState !== "APPROVED" ||
      !approval ||
      approval.revisionId !== revision.id ||
      approval.contentHash !== revision.contentHash ||
      story.publication.approvedContentHash !== revision.contentHash
    ) {
      throw new PreconditionError(
        "Release requires approval of this exact current Story revision.",
      );
    }
    const snapshot = await transaction.publicationSnapshot.create({
      data: {
        publicationId: story.publicationId,
        sourceRevisionId: revision.id,
        sourceContentHash: revision.contentHash,
        slug,
        payload: {
          headline: revision.headline,
          deck: revision.deck,
          excerpt: revision.excerpt,
          body: revision.body as Prisma.InputJsonValue,
        },
      },
    });
    await transaction.publicStoryProjection.upsert({
      where: { publicationId: story.publicationId },
      create: {
        publicationId: story.publicationId,
        snapshotId: snapshot.id,
        slug,
        headline: revision.headline,
        deck: revision.deck,
        excerpt: revision.excerpt,
        body: revision.body as Prisma.InputJsonValue,
        publishedAt: snapshot.activatedAt,
      },
      update: {
        snapshotId: snapshot.id,
        slug,
        headline: revision.headline,
        deck: revision.deck,
        excerpt: revision.excerpt,
        body: revision.body as Prisma.InputJsonValue,
        publishedAt: snapshot.activatedAt,
      },
    });
    await updatePublicationAtVersion(
      transaction,
      story.publicationId,
      input.expectedVersion,
      {
        slug,
        releaseState: "PUBLISHED",
        discoveryDisposition: "ACTIVE",
        activeSnapshotId: snapshot.id,
      },
    );
    await createLifecycleTransition(transaction, {
      publicationId: story.publicationId,
      action: "RELEASED",
      fromState: story.publication.workflowState,
      toState: story.publication.workflowState,
      revisionId: revision.id,
      contentHash: revision.contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
    });
    await createAudit(
      transaction,
      actor.adminUserId,
      "story.release",
      story.id,
      correlationId,
      {
        revisionNumber: revision.number,
        contentHash: revision.contentHash,
        snapshotCreated: true,
      },
    );
    return toDraft(await findStory(transaction, story.id));
  });
}

export async function withdrawStory(
  prisma: PrismaClient,
  actor: StoryActor,
  input: StoryWithdrawalInput,
): Promise<PersistedStoryDraft> {
  requireCapability(actor, "stories.withdraw");
  const reason = normalizedReason(input.reason, true);
  const correlationId = randomUUID();
  return runMutation(prisma, async (transaction) => {
    await requireActiveAdmin(transaction, actor.adminUserId);
    const story = await findStoryForMutation(
      transaction,
      input.storyId,
      input.expectedVersion,
    );
    if (story.publication.releaseState !== "PUBLISHED") {
      throw new PreconditionError(
        "Only a publicly released Story can be withdrawn.",
      );
    }
    await transaction.publicStoryProjection.delete({
      where: { publicationId: story.publicationId },
    });
    await updatePublicationAtVersion(
      transaction,
      story.publicationId,
      input.expectedVersion,
      {
        releaseState: "WITHDRAWN",
        activeSnapshotId: null,
      },
    );
    const revision = currentRevision(story);
    await createLifecycleTransition(transaction, {
      publicationId: story.publicationId,
      dimension: "RELEASE_SNAPSHOT",
      action: "WITHDRAWN",
      fromState: story.publication.workflowState,
      toState: story.publication.workflowState,
      revisionId: revision.id,
      contentHash: revision.contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
      ...(reason ? { reason } : {}),
    });
    await createAudit(
      transaction,
      actor.adminUserId,
      "story.withdraw",
      story.id,
      correlationId,
      { revisionNumber: revision.number, publicAvailabilityRemoved: true },
    );
    return toDraft(await findStory(transaction, story.id));
  });
}

export async function archiveStory(
  prisma: PrismaClient,
  actor: StoryActor,
  input: Readonly<{ storyId: string; expectedVersion: number }>,
): Promise<PersistedStoryDraft> {
  requireCapability(actor, "stories.archive");
  const correlationId = randomUUID();
  return runMutation(prisma, async (transaction) => {
    await requireActiveAdmin(transaction, actor.adminUserId);
    const story = await findStoryForMutation(
      transaction,
      input.storyId,
      input.expectedVersion,
    );
    if (story.publication.releaseState !== "PUBLISHED")
      throw new PreconditionError("Only a released Story can be archived.");
    const revision = currentRevision(story);
    await updatePublicationAtVersion(
      transaction,
      story.publicationId,
      input.expectedVersion,
      { discoveryDisposition: "ARCHIVED" },
    );
    await createLifecycleTransition(transaction, {
      publicationId: story.publicationId,
      dimension: "DISCOVERY_DISPOSITION",
      action: "ARCHIVED",
      fromState: story.publication.workflowState,
      toState: story.publication.workflowState,
      revisionId: revision.id,
      contentHash: revision.contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
    });
    await createAudit(
      transaction,
      actor.adminUserId,
      "story.archive",
      story.id,
      correlationId,
      { revisionNumber: revision.number, ordinaryDiscoveryRemoved: true },
    );
    return toDraft(await findStory(transaction, story.id));
  });
}

export async function getPublicStoryBySlug(
  prisma: PrismaClient,
  slug: string,
): Promise<PublicStory | null> {
  const projection = await prisma.publicStoryProjection.findUnique({
    where: { slug: normalizedSlug(slug) },
    select: {
      slug: true,
      headline: true,
      deck: true,
      excerpt: true,
      body: true,
      publishedAt: true,
    },
  });
  if (!projection) return null;
  return { ...projection, body: validateStoryDocument(projection.body) };
}
