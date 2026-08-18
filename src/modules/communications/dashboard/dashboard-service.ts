import {
  Prisma,
  type PrismaClient,
  type PublicationKind,
} from "@/generated/prisma/client";
import type { Capability } from "@/platform/auth/capabilities";
import type { AdminPrincipal } from "@/platform/auth/principal";
import { AuthorizationError } from "@/platform/errors/app-error";

import { getPublicationQueue, type PublicationQueueItem } from "../queue";
import { PLACEMENT_KEYS } from "../placements";
import {
  DASHBOARD_ACTIVITY_ACTIONS,
  PLACEMENT_LABELS,
  dashboardActivitySummaryCode,
  deriveCurationStatus,
  isAllowlistedDashboardActivity,
  normalizeCommunicationsDashboardRequest,
  type CommunicationsDashboard,
  type CommunicationsDashboardRequest,
  type DashboardActivityItem,
  type DashboardCurationSlot,
  type DashboardCurrentCurationModule,
  type DashboardNeedsAttentionGroup,
  type DashboardNeedsAttentionGroupKey,
  type DashboardNeedsAttentionModule,
  type DashboardPlacementAssignment,
  type DashboardPublicationItem,
  type DashboardRecentActivityModule,
  type DashboardUpcomingItem,
  type DashboardUpcomingModule,
  type NormalizedCommunicationsDashboardRequest,
} from "./dashboard-contracts";

type DashboardActor = Pick<AdminPrincipal, "adminUserId" | "capabilities">;

const STORY_CAPABILITIES = [
  "stories.read.draft.any",
  "stories.read.draft.own",
  "stories.review",
  "stories.approve",
  "stories.publish",
  "stories.withdraw",
  "stories.archive",
] as const satisfies readonly Capability[];

const NEWS_CAPABILITIES = [
  "news.read.draft.any",
  "news.read.draft.own",
  "news.review",
  "news.approve",
  "news.publish",
  "news.withdraw",
  "news.archive",
] as const satisfies readonly Capability[];

const placementSelect = {
  id: true,
  key: true,
  publicationId: true,
  startsAt: true,
  endsAt: true,
  publication: {
    select: {
      kind: true,
      releaseState: true,
      discoveryDisposition: true,
      activeSnapshotId: true,
      story: { select: { id: true } },
      newsItem: { select: { id: true } },
      publicProjection: {
        select: { snapshotId: true, slug: true, headline: true },
      },
      publicNewsProjection: {
        select: {
          snapshotId: true,
          slug: true,
          headline: true,
          expiresAt: true,
        },
      },
    },
  },
} satisfies Prisma.ContentPlacementSelect;

type PlacementRow = Prisma.ContentPlacementGetPayload<{
  select: typeof placementSelect;
}>;

const publicationSubjectSelect = {
  kind: true,
  workflowState: true,
  releaseState: true,
  discoveryDisposition: true,
  activeSnapshotId: true,
  currentRevision: { select: { headline: true } },
  responsibility: { select: { editorialOwnerAdminUserId: true } },
  publicProjection: {
    select: { snapshotId: true, slug: true, headline: true },
  },
  publicNewsProjection: {
    select: {
      snapshotId: true,
      slug: true,
      headline: true,
      expiresAt: true,
    },
  },
} satisfies Prisma.PublicationSelect;

type PublicationSubject = Prisma.PublicationGetPayload<{
  select: typeof publicationSubjectSelect;
}>;

const activitySelect = {
  id: true,
  occurredAt: true,
  actorKind: true,
  action: true,
  targetType: true,
  targetId: true,
  actorAdminUser: {
    select: { authUser: { select: { name: true } } },
  },
} satisfies Prisma.AuditEventSelect;

type ActivityRow = Prisma.AuditEventGetPayload<{
  select: typeof activitySelect;
}>;

type Subject = Readonly<{
  kind: "STORY" | "NEWS" | "PLACEMENT";
  publication: PublicationSubject;
}>;

function has(actor: DashboardActor, capability: Capability) {
  return actor.capabilities.includes(capability);
}

function canInspectAnyPublished(actor: DashboardActor, kind: PublicationKind) {
  if (kind !== "STORY" && kind !== "NEWS") return false;
  const capabilities =
    kind === "STORY" ? STORY_CAPABILITIES : NEWS_CAPABILITIES;
  return capabilities.some((capability) => has(actor, capability));
}

function canInspectDraft(
  actor: DashboardActor,
  kind: PublicationKind,
  ownerId: string | null,
) {
  if (kind !== "STORY" && kind !== "NEWS") return false;
  const anyDraft = has(
    actor,
    kind === "STORY" ? "stories.read.draft.any" : "news.read.draft.any",
  );
  const ownDraft = has(
    actor,
    kind === "STORY" ? "stories.read.draft.own" : "news.read.draft.own",
  );
  return anyDraft || (ownDraft && ownerId === actor.adminUserId);
}

function canInspectPublication(
  actor: DashboardActor,
  publication: PublicationSubject,
) {
  if (publication.releaseState !== "UNPUBLISHED") {
    return canInspectAnyPublished(actor, publication.kind);
  }
  return canInspectDraft(
    actor,
    publication.kind,
    publication.responsibility?.editorialOwnerAdminUserId ?? null,
  );
}

function projectionFor(
  publication: Pick<
    PublicationSubject,
    "kind" | "publicProjection" | "publicNewsProjection"
  >,
) {
  if (publication.kind !== "STORY" && publication.kind !== "NEWS") return null;
  const projection =
    publication.kind === "STORY"
      ? publication.publicProjection
      : publication.publicNewsProjection;
  return projection
    ? {
        snapshotId: projection.snapshotId,
        slug: projection.slug,
        headline: projection.headline,
        expiresAt:
          "expiresAt" in projection ? (projection.expiresAt ?? null) : null,
      }
    : null;
}

function isPubliclyEligible(
  publication: Pick<
    PublicationSubject,
    | "kind"
    | "releaseState"
    | "discoveryDisposition"
    | "activeSnapshotId"
    | "publicProjection"
    | "publicNewsProjection"
  >,
  at: Date,
) {
  if (publication.kind !== "STORY" && publication.kind !== "NEWS") return false;
  const projection = projectionFor(publication);
  return Boolean(
    publication.releaseState === "PUBLISHED" &&
    publication.discoveryDisposition === "ACTIVE" &&
    projection &&
    publication.activeSnapshotId === projection.snapshotId &&
    (publication.kind === "STORY" ||
      projection.expiresAt === null ||
      projection.expiresAt > at),
  );
}

function projectionPath(
  publication: Pick<
    PublicationSubject,
    "kind" | "publicProjection" | "publicNewsProjection"
  >,
) {
  const projection = projectionFor(publication);
  if (!projection) return null;
  return `/${publication.kind === "STORY" ? "stories" : "news"}/${projection.slug}`;
}

function publicationAdminPath(kind: "STORY" | "NEWS", id: string) {
  return `/admin/communications/${kind === "STORY" ? "stories" : "news"}/${id}`;
}

function placementTargetId(row: PlacementRow) {
  if (row.publication.kind !== "STORY" && row.publication.kind !== "NEWS")
    return undefined;
  return row.publication.kind === "STORY"
    ? row.publication.story?.id
    : row.publication.newsItem?.id;
}

function placementAssignment(
  row: PlacementRow,
  actor: DashboardActor,
  at: Date,
): DashboardPlacementAssignment | null {
  if (row.publication.kind !== "STORY" && row.publication.kind !== "NEWS")
    return null;
  const targetId = placementTargetId(row);
  if (!targetId || !canInspectAnyPublished(actor, row.publication.kind)) {
    return null;
  }
  const projection = projectionFor(row.publication);
  return {
    placementId: row.id,
    placementKey: row.key,
    publicationId: row.publicationId,
    targetKind: row.publication.kind,
    headline: projection?.headline ?? null,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    publicPath: projectionPath(row.publication),
    adminPath: publicationAdminPath(row.publication.kind, targetId),
    publicEligibility: isPubliclyEligible(row.publication, at)
      ? "ELIGIBLE"
      : "INELIGIBLE",
  };
}

async function readPlacementRows(
  db: PrismaClient,
  request: NormalizedCommunicationsDashboardRequest,
) {
  return db.contentPlacement.findMany({
    where: {
      key: { in: [...PLACEMENT_KEYS] },
      cancelledAt: null,
      OR: [{ endsAt: null }, { endsAt: { gt: request.evaluationTime } }],
    },
    select: placementSelect,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
}

async function getNeedsAttention(
  db: PrismaClient,
  actor: DashboardActor,
  request: NormalizedCommunicationsDashboardRequest,
): Promise<DashboardNeedsAttentionModule | null> {
  if (!has(actor, "communications.queue.read")) return null;

  const [review, approval, approvedUnreleased] = await Promise.all([
    getPublicationQueue(db, actor, {
      view: "NEEDS_REVIEW",
      page: 1,
      pageSize: request.needsAttentionPreviewLimit,
      now: request.evaluationTime,
    }),
    getPublicationQueue(db, actor, {
      view: "NEEDS_APPROVAL",
      page: 1,
      pageSize: request.needsAttentionPreviewLimit,
      now: request.evaluationTime,
    }),
    getPublicationQueue(db, actor, {
      view: "APPROVED_UNRELEASED",
      page: 1,
      pageSize: request.needsAttentionPreviewLimit,
      now: request.evaluationTime,
    }),
  ]);
  const results = [review, approval, approvedUnreleased] as const;
  const keys = [
    "NEEDS_REVIEW",
    "NEEDS_APPROVAL",
    "APPROVED_UNRELEASED",
  ] as const;
  const groups = results.map((result, index) => {
    const key = keys[index]!;
    const items = result.items.map((item) =>
      dashboardPublicationItem(item, key),
    );
    return {
      key,
      count: result.total,
      items,
    } satisfies DashboardNeedsAttentionGroup;
  }) as unknown as [
    DashboardNeedsAttentionGroup,
    DashboardNeedsAttentionGroup,
    DashboardNeedsAttentionGroup,
  ];
  if (groups.every((group) => group.count === 0)) return null;
  return { groups };
}

function dashboardPublicationItem(
  item: PublicationQueueItem,
  group: DashboardNeedsAttentionGroupKey,
): DashboardPublicationItem {
  return {
    publicationId: item.publicationId,
    publicationKind: item.publicationKind,
    headline: item.headline,
    relevantAt:
      group === "APPROVED_UNRELEASED"
        ? (item.approvedAt ?? item.updatedAt)
        : (item.submittedAt ?? item.updatedAt),
    editorialOwner: item.editorialOwner,
    detailPath: item.detailPath,
    approvalBlockedReasonCode: item.approvalBlockedReasonCode,
  };
}

async function getUpcomingPlacements(
  db: PrismaClient,
  actor: DashboardActor,
  request: NormalizedCommunicationsDashboardRequest,
): Promise<DashboardUpcomingItem[]> {
  if (!has(actor, "communications.placements.manage")) return [];
  const rows = await readPlacementRows(db, request);
  const items = rows
    .filter(
      (row) =>
        row.startsAt > request.evaluationTime &&
        row.startsAt <= request.upcomingUntil,
    )
    .flatMap((row) => {
      const assignment = placementAssignment(row, actor, row.startsAt);
      if (!assignment) return [];
      return [
        {
          kind: "PLACEMENT_ACTIVATION",
          placementId: assignment.placementId,
          placementKey: assignment.placementKey,
          placementLabel: PLACEMENT_LABELS[assignment.placementKey],
          startsAt: assignment.startsAt,
          endsAt: assignment.endsAt,
          publicationId: assignment.publicationId,
          targetKind: assignment.targetKind,
          headline: assignment.headline,
          publicPath: assignment.publicPath,
          adminPath: assignment.adminPath,
          publicEligibility: assignment.publicEligibility,
        } satisfies DashboardUpcomingItem,
      ];
    });
  return items;
}

async function getUpcomingNewsExpirations(
  db: PrismaClient,
  actor: DashboardActor,
  request: NormalizedCommunicationsDashboardRequest,
): Promise<DashboardUpcomingItem[]> {
  if (!canInspectAnyPublished(actor, "NEWS")) return [];
  const rows = await db.publicNewsProjection.findMany({
    where: {
      expiresAt: {
        gt: request.evaluationTime,
        lte: request.upcomingUntil,
      },
      publication: {
        is: {
          kind: "NEWS",
          releaseState: "PUBLISHED",
          discoveryDisposition: "ACTIVE",
        },
      },
    },
    select: {
      publicationId: true,
      snapshotId: true,
      slug: true,
      headline: true,
      expiresAt: true,
      publication: {
        select: {
          activeSnapshotId: true,
          newsItem: { select: { id: true } },
        },
      },
    },
    orderBy: [{ expiresAt: "asc" }, { publicationId: "asc" }],
  });
  return rows
    .filter(
      (row) =>
        row.expiresAt !== null &&
        row.publication.activeSnapshotId === row.snapshotId &&
        row.publication.newsItem !== null,
    )
    .map((row) => {
      const newsId = row.publication.newsItem!.id;
      return {
        kind: "NEWS_EXPIRATION",
        publicationId: row.publicationId,
        newsId,
        headline: row.headline,
        expiresAt: row.expiresAt!,
        publicPath: `/news/${row.slug}`,
        adminPath: publicationAdminPath("NEWS", newsId),
        publicEligibility: "ELIGIBLE",
      } satisfies DashboardUpcomingItem;
    });
}

function upcomingSortKey(item: DashboardUpcomingItem) {
  return item.kind === "PLACEMENT_ACTIVATION" ? item.startsAt : item.expiresAt;
}

async function getUpcoming(
  db: PrismaClient,
  actor: DashboardActor,
  request: NormalizedCommunicationsDashboardRequest,
): Promise<DashboardUpcomingModule | null> {
  const [placements, expirations] = await Promise.all([
    getUpcomingPlacements(db, actor, request),
    getUpcomingNewsExpirations(db, actor, request),
  ]);
  if (placements.length === 0 && expirations.length === 0) {
    const hasSourceCapability =
      has(actor, "communications.placements.manage") ||
      canInspectAnyPublished(actor, "NEWS");
    if (!hasSourceCapability) return null;
  }
  const items = [...placements, ...expirations]
    .sort((left, right) => {
      const time =
        upcomingSortKey(left).getTime() - upcomingSortKey(right).getTime();
      if (time !== 0) return time;
      return `${left.kind}:${"placementId" in left ? left.placementId : left.publicationId}`.localeCompare(
        `${right.kind}:${"placementId" in right ? right.placementId : right.publicationId}`,
      );
    })
    .slice(0, request.upcomingLimit);
  return {
    evaluationTime: request.evaluationTime,
    upcomingUntil: request.upcomingUntil,
    items,
  };
}

async function getCurrentCuration(
  db: PrismaClient,
  actor: DashboardActor,
  request: NormalizedCommunicationsDashboardRequest,
): Promise<DashboardCurrentCurationModule | null> {
  if (!has(actor, "communications.placements.manage")) return null;
  const rows = await readPlacementRows(db, request);
  const slots = PLACEMENT_KEYS.map((key) => {
    const keyRows = rows.filter((row) => row.key === key);
    const currentRow = keyRows.find(
      (row) =>
        row.startsAt <= request.evaluationTime &&
        (row.endsAt === null || row.endsAt > request.evaluationTime),
    );
    const upcomingRow = keyRows.find(
      (row) => row.startsAt > request.evaluationTime,
    );
    const current = currentRow
      ? placementAssignment(currentRow, actor, request.evaluationTime)
      : null;
    const upcoming = upcomingRow
      ? placementAssignment(upcomingRow, actor, upcomingRow.startsAt)
      : null;
    const status = deriveCurationStatus({
      hasConfiguredCurrent: currentRow !== undefined,
      currentIsPubliclyEligible:
        currentRow !== undefined &&
        isPubliclyEligible(currentRow.publication, request.evaluationTime),
      hasUpcoming: upcomingRow !== undefined,
    });
    return {
      placementKey: key,
      label: PLACEMENT_LABELS[key],
      status,
      current,
      upcoming,
    } satisfies DashboardCurationSlot;
  }) as [
    DashboardCurationSlot,
    DashboardCurationSlot,
    DashboardCurationSlot,
    DashboardCurationSlot,
  ];
  return { slots };
}

function publicationSubjectReadable(actor: DashboardActor, subject: Subject) {
  return canInspectPublication(actor, subject.publication);
}

async function readActivitySubjects(
  db: PrismaClient,
  rows: readonly ActivityRow[],
) {
  const storyIds = rows
    .filter((row) => row.targetType === "Story" && row.targetId)
    .map((row) => row.targetId!);
  const newsIds = rows
    .filter((row) => row.targetType === "NewsItem" && row.targetId)
    .map((row) => row.targetId!);
  const placementIds = rows
    .filter((row) => row.targetType === "ContentPlacement" && row.targetId)
    .map((row) => row.targetId!);
  const [stories, news, placements] = await Promise.all([
    db.story.findMany({
      where: { id: { in: storyIds } },
      select: { id: true, publication: { select: publicationSubjectSelect } },
    }),
    db.newsItem.findMany({
      where: { id: { in: newsIds } },
      select: { id: true, publication: { select: publicationSubjectSelect } },
    }),
    db.contentPlacement.findMany({
      where: { id: { in: placementIds } },
      select: {
        id: true,
        key: true,
        publication: { select: publicationSubjectSelect },
      },
    }),
  ]);
  const subjects = new Map<string, Subject>();
  for (const row of stories) {
    subjects.set(`Story:${row.id}`, {
      kind: "STORY",
      publication: row.publication,
    });
  }
  for (const row of news) {
    subjects.set(`NewsItem:${row.id}`, {
      kind: "NEWS",
      publication: row.publication,
    });
  }
  for (const row of placements) {
    subjects.set(`ContentPlacement:${row.id}`, {
      kind: "PLACEMENT",
      publication: row.publication,
    });
  }
  return {
    subjects,
  };
}

function activityItem(
  row: ActivityRow,
  subject: Subject,
): DashboardActivityItem {
  const targetId = row.targetId!;
  const publication = subject.publication;
  const projection = projectionFor(publication);
  const headline =
    subject.kind === "PLACEMENT"
      ? (projection?.headline ?? null)
      : (publication.currentRevision?.headline ?? projection?.headline ?? null);
  const detailPath =
    subject.kind === "STORY"
      ? publicationAdminPath("STORY", targetId)
      : subject.kind === "NEWS"
        ? publicationAdminPath("NEWS", targetId)
        : "/admin/communications/homepage";
  return {
    id: row.id,
    kind: subject.kind === "PLACEMENT" ? "PLACEMENT" : "PUBLICATION",
    action: row.action,
    summaryCode: dashboardActivitySummaryCode(row.action),
    occurredAt: row.occurredAt,
    actorDisplayName:
      row.actorKind === "SYSTEM"
        ? "System"
        : (row.actorAdminUser?.authUser.name ?? "Administrator"),
    subjectKind: subject.kind,
    subjectId: targetId,
    headline,
    detailPath,
  };
}

async function getRecentActivity(
  db: PrismaClient,
  actor: DashboardActor,
  request: NormalizedCommunicationsDashboardRequest,
): Promise<DashboardRecentActivityModule> {
  const rows = await db.auditEvent.findMany({
    where: {
      occurredAt: { lte: request.evaluationTime },
      action: { in: [...DASHBOARD_ACTIVITY_ACTIONS] },
      targetId: { not: null },
      OR: [
        { targetType: "Story" },
        { targetType: "NewsItem" },
        { targetType: "ContentPlacement" },
      ],
    },
    select: activitySelect,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: Math.min(request.recentActivityLimit * 4, 200),
  });
  const validRows = rows.filter((row) =>
    isAllowlistedDashboardActivity(row.action, row.targetType),
  );
  const { subjects } = await readActivitySubjects(db, validRows);
  const items = validRows
    .flatMap((row) => {
      if (!row.targetId) return [];
      const subject = subjects.get(`${row.targetType}:${row.targetId}`);
      if (!subject) return [];
      if (subject.kind === "PLACEMENT") {
        if (!has(actor, "communications.placements.manage")) return [];
        if (!publicationSubjectReadable(actor, subject)) return [];
        return [activityItem(row, subject)];
      }
      if (!publicationSubjectReadable(actor, subject)) return [];
      return [activityItem(row, subject)];
    })
    .slice(0, request.recentActivityLimit);
  return { items };
}

export async function getCommunicationsDashboard(
  db: PrismaClient,
  actor: DashboardActor,
  input: CommunicationsDashboardRequest = {},
): Promise<CommunicationsDashboard> {
  if (!has(actor, "communications.dashboard.read")) {
    throw new AuthorizationError();
  }
  const active = await db.adminUser.findFirst({
    where: { id: actor.adminUserId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!active) throw new AuthorizationError();
  const request = normalizeCommunicationsDashboardRequest(input);
  const [needsAttention, upcoming, currentCuration, recentActivity] =
    await Promise.all([
      getNeedsAttention(db, actor, request),
      getUpcoming(db, actor, request),
      getCurrentCuration(db, actor, request),
      getRecentActivity(db, actor, request),
    ]);
  return {
    generatedAt: request.evaluationTime,
    needsAttention,
    upcoming,
    currentCuration,
    recentActivity,
  };
}
