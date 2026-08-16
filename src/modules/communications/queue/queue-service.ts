import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Capability } from "@/platform/auth/capabilities";
import type { AdminPrincipal } from "@/platform/auth/principal";
import { AuthorizationError } from "@/platform/errors/app-error";

import {
  normalizePublicationQueueRequest,
  queueDetailPath,
  type NormalizedPublicationQueueRequest,
  type PublicationQueueItem,
  type PublicationQueueRequest,
  type PublicationQueueResult,
  type QueueView,
} from "./queue-contracts";

type QueueActor = Pick<AdminPrincipal, "adminUserId" | "capabilities">;

type RawQueueRow = {
  publicationId: string;
  publicationKind: "STORY" | "NEWS";
  headline: string;
  workflowState: PublicationQueueItem["workflowState"];
  releaseState: PublicationQueueItem["releaseState"];
  discoveryDisposition: PublicationQueueItem["discoveryDisposition"];
  newsAvailability: "CURRENT" | "EXPIRED" | null;
  editorialOwnerAdminUserId: string | null;
  editorialOwnerName: string | null;
  currentRevisionNumber: number;
  updatedAt: Date;
  submittedAt: Date | null;
  approvedAt: Date | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  archivedAt: Date | null;
  storyId: string | null;
  newsId: string | null;
  selfApprovalBlocked: boolean;
};

type RawCountRow = {
  all: number;
  myDrafts: number;
  needsReview: number;
  needsApproval: number;
  approvedUnreleased: number;
  recentlyPublished: number;
  expiredNews: number;
  archived: number;
  selectedTotal: number;
};

const STORY_CAPABILITIES = {
  anyDraft: "stories.read.draft.any",
  ownDraft: "stories.read.draft.own",
  review: "stories.review",
  approve: "stories.approve",
  publish: "stories.publish",
  withdraw: "stories.withdraw",
  archive: "stories.archive",
} as const satisfies Record<string, Capability>;

const NEWS_CAPABILITIES = {
  anyDraft: "news.read.draft.any",
  ownDraft: "news.read.draft.own",
  review: "news.review",
  approve: "news.approve",
  publish: "news.publish",
  withdraw: "news.withdraw",
  archive: "news.archive",
} as const satisfies Record<string, Capability>;

function has(actor: QueueActor, capability: Capability) {
  return actor.capabilities.includes(capability);
}

function sqlBoolean(value: boolean) {
  return Prisma.sql`${value}`;
}

function typeCapability(
  actor: QueueActor,
  kind: "STORY" | "NEWS",
  capability: keyof typeof STORY_CAPABILITIES,
) {
  const catalog = kind === "STORY" ? STORY_CAPABILITIES : NEWS_CAPABILITIES;
  return has(actor, catalog[capability]);
}

function canInspectAnyPublished(kind: "STORY" | "NEWS", actor: QueueActor) {
  return (
    typeCapability(actor, kind, "anyDraft") ||
    typeCapability(actor, kind, "review") ||
    typeCapability(actor, kind, "approve") ||
    typeCapability(actor, kind, "publish") ||
    typeCapability(actor, kind, "withdraw") ||
    typeCapability(actor, kind, "archive")
  );
}

function canInspectBroadOwnership(actor: QueueActor) {
  return (
    canInspectAnyPublished("STORY", actor) ||
    canInspectAnyPublished("NEWS", actor)
  );
}

function draftVisibility(actor: QueueActor) {
  return Prisma.sql`(
    (
      p."kind" = 'STORY'
      AND (
        ${sqlBoolean(typeCapability(actor, "STORY", "anyDraft"))}
        OR (
          ${sqlBoolean(typeCapability(actor, "STORY", "ownDraft"))}
          AND r."editorialOwnerAdminUserId" = ${actor.adminUserId}
        )
      )
    )
    OR (
      p."kind" = 'NEWS'
      AND (
        ${sqlBoolean(typeCapability(actor, "NEWS", "anyDraft"))}
        OR (
          ${sqlBoolean(typeCapability(actor, "NEWS", "ownDraft"))}
          AND r."editorialOwnerAdminUserId" = ${actor.adminUserId}
        )
      )
    )
  )`;
}

function reviewVisibility(actor: QueueActor) {
  return Prisma.sql`(
    (
      p."kind" = 'STORY'
      AND ${sqlBoolean(typeCapability(actor, "STORY", "review"))}
      AND (
        ${sqlBoolean(typeCapability(actor, "STORY", "anyDraft"))}
        OR (
          ${sqlBoolean(typeCapability(actor, "STORY", "ownDraft"))}
          AND r."editorialOwnerAdminUserId" = ${actor.adminUserId}
        )
      )
    )
    OR (
      p."kind" = 'NEWS'
      AND ${sqlBoolean(typeCapability(actor, "NEWS", "review"))}
      AND (
        ${sqlBoolean(typeCapability(actor, "NEWS", "anyDraft"))}
        OR (
          ${sqlBoolean(typeCapability(actor, "NEWS", "ownDraft"))}
          AND r."editorialOwnerAdminUserId" = ${actor.adminUserId}
        )
      )
    )
  )`;
}

function approvalVisibility(actor: QueueActor) {
  return Prisma.sql`(
    (
      p."kind" = 'STORY'
      AND ${sqlBoolean(typeCapability(actor, "STORY", "approve"))}
    )
    OR (
      p."kind" = 'NEWS'
      AND ${sqlBoolean(typeCapability(actor, "NEWS", "approve"))}
    )
  )`;
}

function releaseVisibility(actor: QueueActor) {
  return Prisma.sql`(
    (
      p."kind" = 'STORY'
      AND ${sqlBoolean(canInspectAnyPublished("STORY", actor))}
    )
    OR (
      p."kind" = 'NEWS'
      AND ${sqlBoolean(canInspectAnyPublished("NEWS", actor))}
    )
  )`;
}

function viewConditions(actor: QueueActor, now: Date) {
  const myDrafts = Prisma.sql`(
    p."workflowState" IN ('DRAFT', 'CHANGES_REQUESTED')
    AND ${draftVisibility(actor)}
  )`;
  const needsReview = Prisma.sql`(
    p."workflowState" = 'IN_REVIEW'
    AND ${reviewVisibility(actor)}
  )`;
  const needsApproval = Prisma.sql`(
    p."workflowState" = 'PENDING_APPROVAL'
    AND ${approvalVisibility(actor)}
  )`;
  const approvedUnreleased = Prisma.sql`(
    p."workflowState" = 'APPROVED'
    AND p."approvedRevisionId" = p."currentRevisionId"
    AND p."approvedContentHash" = cr."contentHash"
    AND (
      p."activeSnapshotId" IS NULL
      OR active_snapshot."sourceRevisionId" IS DISTINCT FROM p."currentRevisionId"
    )
    AND ${releaseVisibility(actor)}
  )`;
  const recentlyPublished = Prisma.sql`(
    p."releaseState" = 'PUBLISHED'
    AND p."discoveryDisposition" = 'ACTIVE'
    AND ${releaseVisibility(actor)}
    AND (
      (
        p."kind" = 'STORY'
        AND story_projection.id IS NOT NULL
        AND story_projection."snapshotId" = p."activeSnapshotId"
      )
      OR (
        p."kind" = 'NEWS'
        AND news_projection.id IS NOT NULL
        AND news_projection."snapshotId" = p."activeSnapshotId"
        AND (
          news_projection."expiresAt" IS NULL
          OR news_projection."expiresAt" > ${now}
        )
      )
    )
  )`;
  const expiredNews = Prisma.sql`(
    p."kind" = 'NEWS'
    AND p."releaseState" = 'PUBLISHED'
    AND ${sqlBoolean(canInspectAnyPublished("NEWS", actor))}
    AND news_projection.id IS NOT NULL
    AND news_projection."snapshotId" = p."activeSnapshotId"
    AND news_projection."expiresAt" IS NOT NULL
    AND news_projection."expiresAt" <= ${now}
  )`;
  const archived = Prisma.sql`(
    p."discoveryDisposition" = 'ARCHIVED'
    AND ${releaseVisibility(actor)}
  )`;
  return {
    MY_DRAFTS: myDrafts,
    NEEDS_REVIEW: needsReview,
    NEEDS_APPROVAL: needsApproval,
    APPROVED_UNRELEASED: approvedUnreleased,
    RECENTLY_PUBLISHED: recentlyPublished,
    EXPIRED_NEWS: expiredNews,
    ARCHIVED: archived,
    ALL: Prisma.sql`(${myDrafts} OR ${needsReview} OR ${needsApproval} OR ${approvedUnreleased} OR ${recentlyPublished} OR ${expiredNews} OR ${archived})`,
  } satisfies Record<QueueView, Prisma.Sql>;
}

function baseFrom() {
  return Prisma.sql`
    FROM "publication" p
    JOIN "publication_revision" cr
      ON cr.id = p."currentRevisionId"
    LEFT JOIN "publication_responsibility" r
      ON r."publicationId" = p.id
    LEFT JOIN "admin_user" owner_admin
      ON owner_admin.id = r."editorialOwnerAdminUserId"
    LEFT JOIN "user" owner_user
      ON owner_user.id = owner_admin."authUserId"
    LEFT JOIN "publication_approval" current_approval
      ON current_approval."revisionId" = cr.id
    LEFT JOIN "publication_snapshot" active_snapshot
      ON active_snapshot.id = p."activeSnapshotId"
    LEFT JOIN "public_story_projection" story_projection
      ON story_projection."publicationId" = p.id
    LEFT JOIN "public_news_projection" news_projection
      ON news_projection."publicationId" = p.id
    LEFT JOIN "story" story_root
      ON story_root."publicationId" = p.id
    LEFT JOIN "news_item" news_root
      ON news_root."publicationId" = p.id
  `;
}

function filterSql(
  request: NormalizedPublicationQueueRequest,
  actor: QueueActor,
) {
  const kind =
    request.filters.kind === "ALL"
      ? Prisma.sql``
      : Prisma.sql`AND p."kind" = ${request.filters.kind}`;
  const owner = request.filters.editorialOwnerAdminUserId
    ? Prisma.sql`AND r."editorialOwnerAdminUserId" = ${request.filters.editorialOwnerAdminUserId}`
    : Prisma.sql``;
  if (
    request.filters.editorialOwnerAdminUserId &&
    request.filters.editorialOwnerAdminUserId !== actor.adminUserId &&
    !canInspectBroadOwnership(actor)
  ) {
    throw new AuthorizationError(
      "A broader editorial-owner filter is not available to this administrator.",
    );
  }
  return Prisma.sql`${kind} ${owner}`;
}

function orderBy(view: QueueView) {
  switch (view) {
    case "MY_DRAFTS":
      return Prisma.sql`ORDER BY p."updatedAt" DESC, p.id ASC`;
    case "NEEDS_REVIEW":
      return Prisma.sql`ORDER BY "submittedAt" ASC NULLS LAST, p.id ASC`;
    case "NEEDS_APPROVAL":
      return Prisma.sql`ORDER BY "submittedAt" ASC NULLS LAST, p.id ASC`;
    case "APPROVED_UNRELEASED":
      return Prisma.sql`ORDER BY "approvedAt" ASC NULLS LAST, p.id ASC`;
    case "RECENTLY_PUBLISHED":
      return Prisma.sql`ORDER BY "publishedAt" DESC NULLS LAST, p.id ASC`;
    case "EXPIRED_NEWS":
      return Prisma.sql`ORDER BY "expiresAt" DESC NULLS LAST, p.id ASC`;
    case "ARCHIVED":
      return Prisma.sql`ORDER BY "archivedAt" DESC NULLS LAST, p.id ASC`;
    case "ALL":
      return Prisma.sql`ORDER BY p."updatedAt" DESC, p.id ASC`;
  }
}

function projectionSelectWithClock(actor: QueueActor, now: Date) {
  return Prisma.sql`
    p.id AS "publicationId",
    p.kind AS "publicationKind",
    cr.headline AS headline,
    p."workflowState" AS "workflowState",
    p."releaseState" AS "releaseState",
    p."discoveryDisposition" AS "discoveryDisposition",
    CASE
      WHEN p.kind = 'NEWS' AND news_projection.id IS NOT NULL
        THEN CASE
          WHEN news_projection."expiresAt" IS NOT NULL
            AND news_projection."expiresAt" <= ${now}
            THEN 'EXPIRED'
          ELSE 'CURRENT'
        END
      ELSE NULL
    END AS "newsAvailability",
    r."editorialOwnerAdminUserId" AS "editorialOwnerAdminUserId",
    owner_user.name AS "editorialOwnerName",
    cr.number AS "currentRevisionNumber",
    p."updatedAt" AS "updatedAt",
    (
      SELECT MAX(t."occurredAt")
      FROM "publication_lifecycle_transition" t
      WHERE t."publicationId" = p.id
        AND t."revisionId" = cr.id
        AND t.action IN ('SUBMITTED', 'SENT_FOR_APPROVAL')
    ) AS "submittedAt",
    current_approval."approvedAt" AS "approvedAt",
    CASE
      WHEN p.kind = 'STORY' THEN story_projection."publishedAt"
      ELSE news_projection."publishedAt"
    END AS "publishedAt",
    CASE
      WHEN p.kind = 'NEWS' AND news_projection.id IS NOT NULL
        THEN news_projection."expiresAt"
      WHEN p.kind = 'NEWS' THEN cr."newsExpiresAt"
      ELSE NULL
    END AS "expiresAt",
    (
      SELECT MAX(t."occurredAt")
      FROM "publication_lifecycle_transition" t
      WHERE t."publicationId" = p.id
        AND t.action = 'ARCHIVED'
    ) AS "archivedAt",
    story_root.id AS "storyId",
    news_root.id AS "newsId",
    (
      p."createdById" = ${actor.adminUserId}
      OR r."editorialOwnerAdminUserId" = ${actor.adminUserId}
      OR EXISTS (
        SELECT 1
        FROM "publication_revision" self_revision
        WHERE self_revision."publicationId" = p.id
          AND self_revision."createdByAdminUserId" = ${actor.adminUserId}
      )
    ) AS "selfApprovalBlocked"
  `;
}

function toItem(row: RawQueueRow, actor: QueueActor): PublicationQueueItem {
  const detailId = row.publicationKind === "STORY" ? row.storyId : row.newsId;
  if (!detailId || !row.editorialOwnerAdminUserId || !row.editorialOwnerName) {
    throw new Error("Queue source data is missing a required typed relation.");
  }
  const canApprove =
    row.publicationKind === "STORY"
      ? typeCapability(actor, "STORY", "approve")
      : typeCapability(actor, "NEWS", "approve");
  const approvalBlocked =
    row.workflowState === "PENDING_APPROVAL" &&
    canApprove &&
    row.selfApprovalBlocked;
  return {
    publicationId: row.publicationId,
    publicationKind: row.publicationKind,
    headline: row.headline,
    workflowState: row.workflowState,
    releaseState: row.releaseState,
    discoveryDisposition: row.discoveryDisposition,
    newsAvailability: row.newsAvailability,
    editorialOwner: {
      adminUserId: row.editorialOwnerAdminUserId,
      displayName: row.editorialOwnerName,
    },
    currentRevisionNumber: row.currentRevisionNumber,
    updatedAt: row.updatedAt,
    submittedAt: row.submittedAt,
    approvedAt: row.approvedAt,
    publishedAt: row.publishedAt,
    expiresAt: row.expiresAt,
    archivedAt: row.archivedAt,
    detailPath: queueDetailPath(row.publicationKind, detailId),
    canOpenForApproval: canApprove && !approvalBlocked,
    approvalBlockedReasonCode: approvalBlocked ? "SELF_APPROVAL" : null,
  };
}

export async function getPublicationQueue(
  db: PrismaClient,
  actor: QueueActor,
  input: PublicationQueueRequest,
): Promise<PublicationQueueResult> {
  if (!has(actor, "communications.queue.read")) {
    throw new AuthorizationError();
  }
  const active = await db.adminUser.findFirst({
    where: { id: actor.adminUserId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!active) throw new AuthorizationError();
  const request = normalizePublicationQueueRequest(input);
  const conditions = viewConditions(actor, request.now);
  const filters = filterSql(request, actor);
  const where = Prisma.sql`WHERE ${conditions[request.view]} ${filters}`;
  const from = baseFrom();
  const offset = (request.page - 1) * request.pageSize;
  const rows = await db.$queryRaw<RawQueueRow[]>(Prisma.sql`
    SELECT ${projectionSelectWithClock(actor, request.now)}
    ${from}
    ${where}
    ${orderBy(request.view)}
    LIMIT ${request.pageSize}
    OFFSET ${offset}
  `);
  const counts = await db.$queryRaw<RawCountRow[]>(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE ${conditions.ALL} ${filters})::int AS "all",
      COUNT(*) FILTER (WHERE ${conditions.MY_DRAFTS} ${filters})::int AS "myDrafts",
      COUNT(*) FILTER (WHERE ${conditions.NEEDS_REVIEW} ${filters})::int AS "needsReview",
      COUNT(*) FILTER (WHERE ${conditions.NEEDS_APPROVAL} ${filters})::int AS "needsApproval",
      COUNT(*) FILTER (WHERE ${conditions.APPROVED_UNRELEASED} ${filters})::int AS "approvedUnreleased",
      COUNT(*) FILTER (WHERE ${conditions.RECENTLY_PUBLISHED} ${filters})::int AS "recentlyPublished",
      COUNT(*) FILTER (WHERE ${conditions.EXPIRED_NEWS} ${filters})::int AS "expiredNews",
      COUNT(*) FILTER (WHERE ${conditions.ARCHIVED} ${filters})::int AS "archived",
      COUNT(*) FILTER (WHERE ${conditions[request.view]} ${filters})::int AS "selectedTotal"
    ${from}
  `);
  const count = counts[0];
  if (!count) throw new Error("Queue count query returned no row.");
  return {
    items: rows.map((row) => toItem(row, actor)),
    page: request.page,
    pageSize: request.pageSize,
    total: count.selectedTotal,
    hasNextPage: offset + rows.length < count.selectedTotal,
    summary: {
      all: count.all,
      myDrafts: count.myDrafts,
      needsReview: count.needsReview,
      needsApproval: count.needsApproval,
      approvedUnreleased: count.approvedUnreleased,
      recentlyPublished: count.recentlyPublished,
      expiredNews: count.expiredNews,
      archived: count.archived,
    },
    evaluatedAt: request.now,
  };
}

export type PublicationQueueOwnerOption = Readonly<{
  adminUserId: string;
  displayName: string;
}>;

export function getAvailablePublicationQueueViews(
  actor: QueueActor,
): readonly QueueView[] {
  if (!has(actor, "communications.queue.read")) return [];

  const storyDraft =
    typeCapability(actor, "STORY", "anyDraft") ||
    typeCapability(actor, "STORY", "ownDraft");
  const newsDraft =
    typeCapability(actor, "NEWS", "anyDraft") ||
    typeCapability(actor, "NEWS", "ownDraft");
  const storyReview = typeCapability(actor, "STORY", "review") && storyDraft;
  const newsReview = typeCapability(actor, "NEWS", "review") && newsDraft;
  const storyApproval = typeCapability(actor, "STORY", "approve");
  const newsApproval = typeCapability(actor, "NEWS", "approve");
  const storyRelease = canInspectAnyPublished("STORY", actor);
  const newsRelease = canInspectAnyPublished("NEWS", actor);
  const views: QueueView[] = [];

  if (storyDraft || newsDraft) views.push("MY_DRAFTS");
  if (storyReview || newsReview) views.push("NEEDS_REVIEW");
  if (storyApproval || newsApproval) views.push("NEEDS_APPROVAL");
  if (storyRelease || newsRelease) views.push("APPROVED_UNRELEASED");
  if (storyRelease || newsRelease) views.push("RECENTLY_PUBLISHED");
  if (newsRelease) views.push("EXPIRED_NEWS");
  if (storyRelease || newsRelease) views.push("ARCHIVED");
  if (views.length) views.push("ALL");
  return views;
}

export async function listPublicationQueueOwnerOptions(
  db: PrismaClient,
  actor: QueueActor,
  now = new Date(),
): Promise<readonly PublicationQueueOwnerOption[]> {
  if (!has(actor, "communications.queue.read")) {
    throw new AuthorizationError();
  }
  const active = await db.adminUser.findFirst({
    where: { id: actor.adminUserId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!active) throw new AuthorizationError();
  if (!canInspectBroadOwnership(actor)) return [];

  const conditions = viewConditions(actor, now);
  const rows = await db.$queryRaw<PublicationQueueOwnerOption[]>(Prisma.sql`
    SELECT DISTINCT
      r."editorialOwnerAdminUserId" AS "adminUserId",
      owner_user.name AS "displayName"
    ${baseFrom()}
    WHERE r."editorialOwnerAdminUserId" IS NOT NULL
      AND owner_user.name IS NOT NULL
      AND ${conditions.ALL}
    ORDER BY owner_user.name ASC, r."editorialOwnerAdminUserId" ASC
  `);
  return rows;
}
