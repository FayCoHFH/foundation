import { randomUUID } from "node:crypto";
import type {
  Prisma,
  PrismaClient,
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
  hashNewsCandidate,
  NEWS_CONTENT_HASH_VERSION,
  type NewsCandidate,
  type NewsDocument,
  validateNewsCandidate,
  validateNewsDocument,
} from "./content";
import {
  assignPlacement,
  clearPlacement,
  getEffectivePlacement,
} from "../placements/placement-service";
import {
  nextStoryWorkflowState,
  type StoryWorkflowAction,
} from "../stories/workflow";

type Actor = Pick<AdminPrincipal, "adminUserId" | "capabilities">;
type Tx = Prisma.TransactionClient;
const include = {
  publication: {
    include: {
      responsibility: true,
      currentRevision: true,
      approvedRevision: { include: { approval: true } },
      snapshots: { select: { id: true } },
    },
  },
} satisfies Prisma.NewsItemInclude;
type NewsRecord = Prisma.NewsItemGetPayload<{ include: typeof include }>;
export type NewsDraft = Readonly<{
  newsId: string;
  publicationId: string;
  version: number;
  workflow: PublicationWorkflowState;
  releaseState: "UNPUBLISHED" | "PUBLISHED" | "WITHDRAWN";
  discoveryDisposition: "ACTIVE" | "ARCHIVED";
  slug: string | null;
  snapshotCount: number;
  editorialOwnerAdminUserId: string;
  currentRevision: Readonly<{
    id: string;
    number: number;
    headline: string;
    summary: string;
    body: NewsDocument;
    expiresAt: Date | null;
    contentHash: string;
    createdAt: Date;
  }>;
  approval: Readonly<{ revisionId: string; contentHash: string }> | null;
}>;
export type NewsWorkflowInput = Readonly<{
  newsId: string;
  expectedVersion: number;
  expectedContentHash: string;
  reason?: string | undefined;
}>;
export type NewsReleaseInput = NewsWorkflowInput & { slug: string };
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{3,4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(value: string, label = "News ID") {
  if (!uuid.test(value))
    throw new ValidationError(`${label} must be a valid identifier.`);
}
function version(value: number) {
  if (!Number.isInteger(value) || value < 1)
    throw new ValidationError("News version must be a positive integer.");
}
function slug(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) || normalized.length > 160)
    throw new ValidationError(
      "Use a canonical URL slug with lowercase letters, numbers, and hyphens.",
    );
  return normalized;
}
function cap(actor: Actor, value: Capability) {
  if (!actor.capabilities.includes(value)) throw new AuthorizationError();
}
async function active(tx: Tx, adminUserId: string) {
  if (
    !(await tx.adminUser.findFirst({
      where: { id: adminUserId, status: "ACTIVE" },
      select: { id: true },
    }))
  )
    throw new AuthorizationError();
}
function revision(record: NewsRecord) {
  if (!record.publication.currentRevision)
    throw new PreconditionError("This News item has no current revision.");
  return record.publication.currentRevision;
}
function owner(record: NewsRecord) {
  if (!record.publication.responsibility)
    throw new PreconditionError(
      "This News item has no editorial responsibility.",
    );
  return record.publication.responsibility;
}
function draft(record: NewsRecord): NewsDraft {
  const current = revision(record),
    approval = record.publication.approvedRevision?.approval;
  if (!current.newsSummary)
    throw new PreconditionError("News revision payload is incomplete.");
  return {
    newsId: record.id,
    publicationId: record.publicationId,
    version: record.publication.version,
    workflow: record.publication.workflowState,
    releaseState: record.publication.releaseState,
    discoveryDisposition: record.publication.discoveryDisposition,
    slug: record.publication.slug,
    snapshotCount: record.publication.snapshots.length,
    editorialOwnerAdminUserId: owner(record).editorialOwnerAdminUserId,
    currentRevision: {
      id: current.id,
      number: current.number,
      headline: current.headline,
      summary: current.newsSummary,
      body: validateNewsDocument(current.body),
      expiresAt: current.newsExpiresAt,
      contentHash: current.contentHash,
      createdAt: current.createdAt,
    },
    approval: approval
      ? { revisionId: approval.revisionId, contentHash: approval.contentHash }
      : null,
  };
}
async function find(tx: Tx, newsId: string) {
  id(newsId);
  const news = await tx.newsItem.findUnique({ where: { id: newsId }, include });
  if (!news) throw new NotFoundError("News draft was not found.");
  return news;
}
async function mutation(tx: Tx, newsId: string, expectedVersion: number) {
  version(expectedVersion);
  const record = await find(tx, newsId);
  if (record.publication.version !== expectedVersion)
    throw new ConcurrencyError();
  return record;
}
function readable(actor: Actor, record: NewsRecord) {
  if (
    actor.capabilities.includes("news.read.draft.any") ||
    (actor.capabilities.includes("news.read.draft.own") &&
      owner(record).editorialOwnerAdminUserId === actor.adminUserId)
  )
    return;
  throw new AuthorizationError();
}
function editable(actor: Actor, record: NewsRecord) {
  if (
    actor.capabilities.includes("news.edit.any") ||
    (actor.capabilities.includes("news.edit.own") &&
      owner(record).editorialOwnerAdminUserId === actor.adminUserId)
  )
    return;
  throw new AuthorizationError();
}
function hash(record: NewsRecord, expected: string) {
  if (revision(record).contentHash !== expected)
    throw new PreconditionError(
      "The News candidate changed. Reload the draft before continuing.",
    );
}
async function update(
  tx: Tx,
  publicationId: string,
  expectedVersion: number,
  data: Prisma.PublicationUncheckedUpdateInput,
) {
  try {
    await tx.publication.update({
      where: { id_version: { id: publicationId, version: expectedVersion } },
      data: { ...data, version: { increment: 1 } },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      (["P2002", "P2025"] as unknown[]).includes(
        (error as { code: string }).code,
      )
    )
      throw new ConcurrencyError();
    throw error;
  }
}
async function event(
  tx: Tx,
  actor: string,
  action: string,
  target: string,
  correlationId: string,
  summary: Record<string, string | number | boolean | null>,
) {
  await tx.auditEvent.create({
    data: buildAuditEvent({
      actorKind: "ADMIN_USER",
      actorAdminUserId: actor,
      action,
      targetType: "NewsItem",
      targetId: target,
      correlationId,
      summary,
    }),
  });
}
async function lifecycle(
  tx: Tx,
  data: {
    publicationId: string;
    action: PublicationLifecycleAction;
    fromState: PublicationWorkflowState | null;
    toState: PublicationWorkflowState | null;
    revisionId: string;
    contentHash: string;
    actorAdminUserId: string;
    correlationId: string;
    reason?: string | undefined;
    dimension?:
      | "CANDIDATE_WORKFLOW"
      | "RELEASE_SNAPSHOT"
      | "DISCOVERY_DISPOSITION"
      | undefined;
  },
) {
  await tx.publicationLifecycleTransition.create({
    data: {
      ...data,
      dimension: data.dimension ?? "CANDIDATE_WORKFLOW",
      reason: data.reason ?? null,
    },
  });
}
async function run<T>(db: PrismaClient, fn: (tx: Tx) => Promise<T>) {
  return db.$transaction(fn);
}
export async function createNews(
  db: PrismaClient,
  actor: Actor,
  input: NewsCandidate & { editorialOwnerAdminUserId?: string },
) {
  cap(actor, "news.create");
  const candidate = validateNewsCandidate(input),
    correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const ownerId = input.editorialOwnerAdminUserId ?? actor.adminUserId;
    id(ownerId, "Editorial owner ID");
    if (ownerId !== actor.adminUserId) cap(actor, "news.edit.any");
    await active(tx, ownerId);
    const publication = await tx.publication.create({
      data: {
        kind: "NEWS",
        createdById: actor.adminUserId,
        newsItem: { create: {} },
        responsibility: {
          create: {
            editorialOwnerAdminUserId: ownerId,
            changedByAdminUserId: actor.adminUserId,
          },
        },
      },
      include: { newsItem: true },
    });
    if (!publication.newsItem) throw new Error("News root was not created.");
    const contentHash = hashNewsCandidate(candidate);
    const current = await tx.publicationRevision.create({
      data: {
        publicationId: publication.id,
        number: 1,
        headline: candidate.headline,
        excerpt: candidate.summary,
        newsSummary: candidate.summary,
        newsExpiresAt: candidate.expiresAt,
        body: candidate.body as Prisma.InputJsonValue,
        schemaVersion: candidate.body.schemaVersion,
        contentHash,
        contentHashVersion: NEWS_CONTENT_HASH_VERSION,
        createdByAdminUserId: actor.adminUserId,
      },
    });
    await tx.publication.update({
      where: { id: publication.id },
      data: { currentRevisionId: current.id },
    });
    await lifecycle(tx, {
      publicationId: publication.id,
      action: "DRAFT_CREATED",
      fromState: null,
      toState: "DRAFT",
      revisionId: current.id,
      contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
    });
    await event(
      tx,
      actor.adminUserId,
      "news.create",
      publication.newsItem.id,
      correlationId,
      { revisionNumber: 1, workflow: "DRAFT" },
    );
    return draft(await find(tx, publication.newsItem.id));
  });
}
export async function getNewsDraft(
  db: PrismaClient,
  actor: Actor,
  newsId: string,
) {
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await find(tx, newsId);
    readable(actor, record);
    return draft(record);
  });
}
export async function listNewsDrafts(db: PrismaClient, actor: Actor) {
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    if (
      !actor.capabilities.includes("news.read.draft.any") &&
      !actor.capabilities.includes("news.read.draft.own")
    )
      throw new AuthorizationError();
    const rows = await tx.newsItem.findMany({
      include: include,
      orderBy: { createdAt: "desc" },
    });
    return rows
      .filter(
        (row) =>
          actor.capabilities.includes("news.read.draft.any") ||
          owner(row).editorialOwnerAdminUserId === actor.adminUserId,
      )
      .map(draft);
  });
}
export async function saveNewsRevision(
  db: PrismaClient,
  actor: Actor,
  input: NewsCandidate & { newsId: string; expectedVersion: number },
) {
  const candidate = validateNewsCandidate(input),
    correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await mutation(tx, input.newsId, input.expectedVersion);
    editable(actor, record);
    const prior = revision(record),
      contentHash = hashNewsCandidate(candidate);
    const next = await tx.publicationRevision.create({
      data: {
        publicationId: record.publicationId,
        number: prior.number + 1,
        parentRevisionId: prior.id,
        headline: candidate.headline,
        excerpt: candidate.summary,
        newsSummary: candidate.summary,
        newsExpiresAt: candidate.expiresAt,
        body: candidate.body as Prisma.InputJsonValue,
        schemaVersion: candidate.body.schemaVersion,
        contentHash,
        contentHashVersion: NEWS_CONTENT_HASH_VERSION,
        createdByAdminUserId: actor.adminUserId,
      },
    });
    await update(tx, record.publicationId, input.expectedVersion, {
      workflowState: "DRAFT",
      approvedContentHash: null,
      approvedRevisionId: null,
      currentRevisionId: next.id,
    });
    await lifecycle(tx, {
      publicationId: record.publicationId,
      action: "REVISION_CREATED",
      fromState: record.publication.workflowState,
      toState: "DRAFT",
      revisionId: next.id,
      contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
    });
    await event(
      tx,
      actor.adminUserId,
      "news.revision.create",
      record.id,
      correlationId,
      {
        revisionNumber: next.number,
        expirationConfigured: candidate.expiresAt !== null,
      },
    );
    return draft(await find(tx, record.id));
  });
}
const lifecycleActions: Record<
  StoryWorkflowAction,
  PublicationLifecycleAction
> = {
  SUBMIT: "SUBMITTED",
  REQUEST_CHANGES: "CHANGES_REQUESTED",
  SEND_FOR_APPROVAL: "SENT_FOR_APPROVAL",
  APPROVE: "APPROVED",
};
async function workflow(
  db: PrismaClient,
  actor: Actor,
  action: Exclude<StoryWorkflowAction, "APPROVE">,
  input: NewsWorkflowInput,
) {
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await mutation(tx, input.newsId, input.expectedVersion);
    hash(record, input.expectedContentHash);
    if (action === "SUBMIT") {
      cap(actor, "news.submit");
      if (
        owner(record).editorialOwnerAdminUserId !== actor.adminUserId &&
        !actor.capabilities.includes("news.edit.any")
      )
        throw new AuthorizationError();
    } else cap(actor, "news.review");
    const reason = input.reason?.trim();
    if (action === "REQUEST_CHANGES" && (!reason || reason.length < 3))
      throw new ValidationError(
        "Provide a brief reason for requested changes.",
      );
    const next = nextStoryWorkflowState(
      record.publication.workflowState,
      action,
    );
    const current = revision(record);
    await update(tx, record.publicationId, input.expectedVersion, {
      workflowState: next,
    });
    await lifecycle(tx, {
      publicationId: record.publicationId,
      action: lifecycleActions[action],
      fromState: record.publication.workflowState,
      toState: next,
      revisionId: current.id,
      contentHash: current.contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
      reason,
    });
    await event(
      tx,
      actor.adminUserId,
      `news.${action.toLowerCase()}`,
      record.id,
      correlationId,
      { revisionNumber: current.number },
    );
    return draft(await find(tx, record.id));
  });
}
export const submitNews = (
  db: PrismaClient,
  actor: Actor,
  input: NewsWorkflowInput,
) => workflow(db, actor, "SUBMIT", input);
export const requestNewsChanges = (
  db: PrismaClient,
  actor: Actor,
  input: NewsWorkflowInput,
) => workflow(db, actor, "REQUEST_CHANGES", input);
export const sendNewsForApproval = (
  db: PrismaClient,
  actor: Actor,
  input: NewsWorkflowInput,
) => workflow(db, actor, "SEND_FOR_APPROVAL", input);
export async function approveNews(
  db: PrismaClient,
  actor: Actor,
  input: NewsWorkflowInput,
) {
  cap(actor, "news.approve");
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await mutation(tx, input.newsId, input.expectedVersion);
    hash(record, input.expectedContentHash);
    const current = revision(record);
    const next = nextStoryWorkflowState(
      record.publication.workflowState,
      "APPROVE",
    );
    const contributor = await tx.publicationRevision.findFirst({
      where: {
        publicationId: record.publicationId,
        createdByAdminUserId: actor.adminUserId,
      },
      select: { id: true },
    });
    if (
      contributor ||
      record.publication.createdById === actor.adminUserId ||
      owner(record).editorialOwnerAdminUserId === actor.adminUserId
    )
      throw new AuthorizationError(
        "A creator, owner, or material editor cannot approve this News candidate.",
      );
    await tx.publicationApproval.create({
      data: {
        publicationId: record.publicationId,
        revisionId: current.id,
        contentHash: current.contentHash,
        contentHashVersion: NEWS_CONTENT_HASH_VERSION,
        approvedByAdminUserId: actor.adminUserId,
      },
    });
    await update(tx, record.publicationId, input.expectedVersion, {
      workflowState: next,
      approvedContentHash: current.contentHash,
      approvedRevisionId: current.id,
    });
    await lifecycle(tx, {
      publicationId: record.publicationId,
      action: "APPROVED",
      fromState: record.publication.workflowState,
      toState: next,
      revisionId: current.id,
      contentHash: current.contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
    });
    await event(
      tx,
      actor.adminUserId,
      "news.approve",
      record.id,
      correlationId,
      { revisionNumber: current.number },
    );
    return draft(await find(tx, record.id));
  });
}
export async function releaseNews(
  db: PrismaClient,
  actor: Actor,
  input: NewsReleaseInput,
) {
  cap(actor, "news.publish");
  const normalized = slug(input.slug),
    correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await mutation(tx, input.newsId, input.expectedVersion);
    hash(record, input.expectedContentHash);
    const current = revision(record),
      approval = record.publication.approvedRevision?.approval;
    if (
      record.publication.workflowState !== "APPROVED" ||
      !approval ||
      approval.revisionId !== current.id ||
      approval.contentHash !== current.contentHash ||
      record.publication.approvedContentHash !== current.contentHash ||
      !current.newsSummary
    )
      throw new PreconditionError(
        "Release requires approval of this exact current News revision.",
      );
    const snapshot = await tx.publicationSnapshot.create({
      data: {
        publicationId: record.publicationId,
        sourceRevisionId: current.id,
        sourceContentHash: current.contentHash,
        slug: normalized,
        payload: {
          headline: current.headline,
          summary: current.newsSummary,
          body: current.body as Prisma.InputJsonValue,
          expiresAt: current.newsExpiresAt?.toISOString() ?? null,
        },
      },
    });
    await tx.publicNewsProjection.upsert({
      where: { publicationId: record.publicationId },
      create: {
        publicationId: record.publicationId,
        snapshotId: snapshot.id,
        slug: normalized,
        headline: current.headline,
        summary: current.newsSummary,
        body: current.body as Prisma.InputJsonValue,
        publishedAt: snapshot.activatedAt,
        expiresAt: current.newsExpiresAt,
      },
      update: {
        snapshotId: snapshot.id,
        slug: normalized,
        headline: current.headline,
        summary: current.newsSummary,
        body: current.body as Prisma.InputJsonValue,
        publishedAt: snapshot.activatedAt,
        expiresAt: current.newsExpiresAt,
      },
    });
    await update(tx, record.publicationId, input.expectedVersion, {
      slug: normalized,
      releaseState: "PUBLISHED",
      discoveryDisposition: "ACTIVE",
      activeSnapshotId: snapshot.id,
    });
    await lifecycle(tx, {
      publicationId: record.publicationId,
      action: "RELEASED",
      fromState: record.publication.workflowState,
      toState: record.publication.workflowState,
      revisionId: current.id,
      contentHash: current.contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
      dimension: "RELEASE_SNAPSHOT",
    });
    await event(
      tx,
      actor.adminUserId,
      "news.release",
      record.id,
      correlationId,
      { revisionNumber: current.number, snapshotCreated: true },
    );
    return draft(await find(tx, record.id));
  });
}
async function disposition(
  db: PrismaClient,
  actor: Actor,
  input: { newsId: string; expectedVersion: number; reason?: string },
  action: "withdraw" | "archive",
) {
  cap(actor, action === "withdraw" ? "news.withdraw" : "news.archive");
  const correlationId = randomUUID();
  return run(db, async (tx) => {
    await active(tx, actor.adminUserId);
    const record = await mutation(tx, input.newsId, input.expectedVersion);
    if (record.publication.releaseState !== "PUBLISHED")
      throw new PreconditionError(
        `Only a released News item can be ${action}n.`,
      );
    if (action === "withdraw")
      await tx.publicNewsProjection.delete({
        where: { publicationId: record.publicationId },
      });
    const current = revision(record);
    await update(
      tx,
      record.publicationId,
      input.expectedVersion,
      action === "withdraw"
        ? { releaseState: "WITHDRAWN", activeSnapshotId: null }
        : { discoveryDisposition: "ARCHIVED" },
    );
    await lifecycle(tx, {
      publicationId: record.publicationId,
      action: action === "withdraw" ? "WITHDRAWN" : "ARCHIVED",
      fromState: record.publication.workflowState,
      toState: record.publication.workflowState,
      revisionId: current.id,
      contentHash: current.contentHash,
      actorAdminUserId: actor.adminUserId,
      correlationId,
      reason: input.reason?.trim(),
      dimension:
        action === "withdraw" ? "RELEASE_SNAPSHOT" : "DISCOVERY_DISPOSITION",
    });
    await event(
      tx,
      actor.adminUserId,
      `news.${action}`,
      record.id,
      correlationId,
      { publicAvailabilityRemoved: action === "withdraw" },
    );
    return draft(await find(tx, record.id));
  });
}
export const withdrawNews = (
  db: PrismaClient,
  actor: Actor,
  input: { newsId: string; expectedVersion: number; reason: string },
) => disposition(db, actor, input, "withdraw");
export const archiveNews = (
  db: PrismaClient,
  actor: Actor,
  input: { newsId: string; expectedVersion: number },
) => disposition(db, actor, input, "archive");
export type PublicNews = Readonly<{
  slug: string;
  headline: string;
  summary: string;
  body: NewsDocument;
  publishedAt: Date;
  expiresAt: Date | null;
}>;
export function isCurrentNews(
  item: Pick<PublicNews, "expiresAt">,
  now = new Date(),
) {
  return !item.expiresAt || item.expiresAt.getTime() > now.getTime();
}
export async function getPublicNewsBySlug(
  db: PrismaClient,
  value: string,
): Promise<PublicNews | null> {
  const projection = await db.publicNewsProjection.findUnique({
    where: { slug: slug(value) },
  });
  return projection
    ? { ...projection, body: validateNewsDocument(projection.body) }
    : null;
}
export async function getLatestNews(
  db: PrismaClient,
  now = new Date(),
): Promise<PublicNews[]> {
  const rows = await db.publicNewsProjection.findMany({
    where: {
      publication: {
        releaseState: "PUBLISHED",
        discoveryDisposition: "ACTIVE",
      },
    },
    orderBy: { publishedAt: "desc" },
  });
  return rows
    .filter((row) => !row.expiresAt || row.expiresAt > now)
    .map((row) => ({ ...row, body: validateNewsDocument(row.body) }));
}
export async function getFeaturedNews(
  db: PrismaClient,
  now = new Date(),
): Promise<PublicNews | null> {
  const placement = await getEffectivePlacement(db, "NEWS_FEATURED", now);
  const item = placement?.news;
  return !item || !isCurrentNews(item, now)
    ? null
    : { ...item, body: validateNewsDocument(item.body) };
}
export async function setFeaturedNews(
  db: PrismaClient,
  actor: Actor,
  newsId: string | null,
) {
  cap(actor, "communications.placements.manage");
  if (!newsId) return clearPlacement(db, actor, "NEWS_FEATURED");
  const record = await find(db as never, newsId);
  return assignPlacement(db, actor, {
    key: "NEWS_FEATURED",
    publicationId: record.publicationId,
  });
}
