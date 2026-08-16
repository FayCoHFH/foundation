import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getCommunicationsDashboard } from "@/modules/communications/dashboard";
import { getPublicationQueue } from "@/modules/communications/queue";
import type { Capability } from "@/platform/auth/capabilities";
import { buildAuditEvent } from "@/platform/audit/event";
import { AuthorizationError } from "@/platform/errors/app-error";

import { assertDestructiveTestDatabaseSafety } from "../support/destructive-test-database";

const testDatabase = assertDestructiveTestDatabaseSafety();
const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("@/generated/prisma/client");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabase.databaseUrl }),
});

type Actor = { adminUserId: string; capabilities: readonly Capability[] };
type Kind = "STORY" | "NEWS";

const evaluationTime = new Date("2040-08-16T12:00:00.000Z");
const upcomingUntil = new Date("2040-08-30T12:00:00.000Z");
const body = {
  schemaVersion: 1,
  root: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Dashboard fixture." }],
      },
    ],
  },
};

async function actor(roleKey: string): Promise<Actor> {
  const suffix = randomUUID();
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  const user = await prisma.user.create({
    data: {
      id: `dashboard-${suffix}`,
      name: `Dashboard ${role.name} ${suffix.slice(0, 6)}`,
      email: `dashboard-${suffix}@example.org`,
      emailVerified: true,
      workspaceDomain: "example.org",
    },
  });
  const admin = await prisma.adminUser.create({
    data: { authUserId: user.id, status: "ACTIVE" },
  });
  await prisma.userRole.create({
    data: { adminUserId: admin.id, roleId: role.id },
  });
  return {
    adminUserId: admin.id,
    capabilities: role.permissions.map(
      ({ permission }) => permission.key as Capability,
    ),
  };
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

type ContentOptions = Readonly<{
  kind: Kind;
  title: string;
  owner: Actor;
  workflow?: "DRAFT" | "IN_REVIEW" | "PENDING_APPROVAL" | "APPROVED";
  releaseState?: "UNPUBLISHED" | "PUBLISHED" | "WITHDRAWN";
  discoveryDisposition?: "ACTIVE" | "ARCHIVED";
  expiresAt?: Date | null;
  publishedAt?: Date;
  createdAt?: Date;
}>;

async function content(options: ContentOptions) {
  const createdAt = options.createdAt ?? evaluationTime;
  const workflow = options.workflow ?? "DRAFT";
  const releaseState = options.releaseState ?? "UNPUBLISHED";
  const discoveryDisposition = options.discoveryDisposition ?? "ACTIVE";
  const publication = await prisma.publication.create({
    data: {
      kind: options.kind,
      workflowState: workflow,
      releaseState,
      discoveryDisposition,
      createdById: options.owner.adminUserId,
      createdAt,
      updatedAt: createdAt,
      responsibility: {
        create: {
          editorialOwnerAdminUserId: options.owner.adminUserId,
          changedByAdminUserId: options.owner.adminUserId,
        },
      },
      ...(options.kind === "STORY"
        ? { story: { create: {} } }
        : { newsItem: { create: {} } }),
    },
    include: { story: true, newsItem: true },
  });
  const revision = await prisma.publicationRevision.create({
    data: {
      publicationId: publication.id,
      number: 1,
      headline: options.title,
      excerpt: `${options.title} excerpt`,
      newsSummary: options.kind === "NEWS" ? `${options.title} summary` : null,
      newsExpiresAt:
        options.kind === "NEWS" ? (options.expiresAt ?? null) : null,
      body,
      schemaVersion: 1,
      contentHash: hash(`${publication.id}:1`),
      createdByAdminUserId: options.owner.adminUserId,
      createdAt,
    },
  });
  await prisma.publication.update({
    where: { id: publication.id },
    data: { currentRevisionId: revision.id },
  });
  await prisma.publicationLifecycleTransition.create({
    data: {
      publicationId: publication.id,
      dimension: "CANDIDATE_WORKFLOW",
      action: "DRAFT_CREATED",
      toState: "DRAFT",
      revisionId: revision.id,
      contentHash: revision.contentHash,
      actorAdminUserId: options.owner.adminUserId,
      correlationId: randomUUID(),
      occurredAt: createdAt,
    },
  });
  if (workflow !== "DRAFT") {
    await prisma.publicationLifecycleTransition.create({
      data: {
        publicationId: publication.id,
        dimension: "CANDIDATE_WORKFLOW",
        action: "SUBMITTED",
        fromState: "DRAFT",
        toState:
          workflow === "PENDING_APPROVAL" || workflow === "APPROVED"
            ? "IN_REVIEW"
            : "IN_REVIEW",
        revisionId: revision.id,
        contentHash: revision.contentHash,
        actorAdminUserId: options.owner.adminUserId,
        correlationId: randomUUID(),
        occurredAt: new Date(createdAt.getTime() + 1_000),
      },
    });
  }
  if (workflow === "PENDING_APPROVAL" || workflow === "APPROVED") {
    await prisma.publicationLifecycleTransition.create({
      data: {
        publicationId: publication.id,
        dimension: "CANDIDATE_WORKFLOW",
        action: "SENT_FOR_APPROVAL",
        fromState: "IN_REVIEW",
        toState: "PENDING_APPROVAL",
        revisionId: revision.id,
        contentHash: revision.contentHash,
        actorAdminUserId: options.owner.adminUserId,
        correlationId: randomUUID(),
        occurredAt: new Date(createdAt.getTime() + 2_000),
      },
    });
  }
  if (workflow === "APPROVED") {
    await prisma.publication.update({
      where: { id: publication.id },
      data: {
        approvedRevisionId: revision.id,
        approvedContentHash: revision.contentHash,
      },
    });
    await prisma.publicationApproval.create({
      data: {
        publicationId: publication.id,
        revisionId: revision.id,
        contentHash: revision.contentHash,
        approvedByAdminUserId: options.owner.adminUserId,
        approvedAt: new Date(createdAt.getTime() + 3_000),
      },
    });
    await prisma.publicationLifecycleTransition.create({
      data: {
        publicationId: publication.id,
        dimension: "CANDIDATE_WORKFLOW",
        action: "APPROVED",
        fromState: "PENDING_APPROVAL",
        toState: "APPROVED",
        revisionId: revision.id,
        contentHash: revision.contentHash,
        actorAdminUserId: options.owner.adminUserId,
        correlationId: randomUUID(),
        occurredAt: new Date(createdAt.getTime() + 3_000),
      },
    });
  }
  if (releaseState === "PUBLISHED") {
    const publishedAt =
      options.publishedAt ?? new Date(createdAt.getTime() + 4_000);
    const snapshot = await prisma.publicationSnapshot.create({
      data: {
        publicationId: publication.id,
        sourceRevisionId: revision.id,
        sourceContentHash: revision.contentHash,
        slug: `dashboard-${randomUUID()}`,
        payload: { headline: options.title, body },
        activatedAt: publishedAt,
      },
    });
    if (options.kind === "STORY") {
      await prisma.publicStoryProjection.create({
        data: {
          publicationId: publication.id,
          snapshotId: snapshot.id,
          slug: snapshot.slug,
          headline: options.title,
          deck: null,
          excerpt: `${options.title} excerpt`,
          body,
          publishedAt,
        },
      });
    } else {
      await prisma.publicNewsProjection.create({
        data: {
          publicationId: publication.id,
          snapshotId: snapshot.id,
          slug: snapshot.slug,
          headline: options.title,
          summary: `${options.title} summary`,
          body,
          publishedAt,
          expiresAt: options.expiresAt ?? null,
        },
      });
    }
    await prisma.publication.update({
      where: { id: publication.id },
      data: { activeSnapshotId: snapshot.id },
    });
  }
  if (discoveryDisposition === "ARCHIVED") {
    await prisma.publicationLifecycleTransition.create({
      data: {
        publicationId: publication.id,
        dimension: "DISCOVERY_DISPOSITION",
        action: "ARCHIVED",
        revisionId: revision.id,
        contentHash: revision.contentHash,
        actorAdminUserId: options.owner.adminUserId,
        correlationId: randomUUID(),
        occurredAt: new Date(createdAt.getTime() + 5_000),
      },
    });
  }
  return {
    publicationId: publication.id,
    storyId: publication.story?.id ?? null,
    newsId: publication.newsItem?.id ?? null,
  };
}

async function placement(
  key:
    | "HOME_HERO"
    | "HOME_FEATURED_STORY"
    | "HOME_FEATURED_NEWS"
    | "NEWS_FEATURED",
  publicationId: string,
  owner: Actor,
  startsAt: Date,
  options: { endsAt?: Date | null; cancelledAt?: Date | null } = {},
) {
  return prisma.contentPlacement.create({
    data: {
      key,
      publicationId,
      startsAt,
      endsAt: options.endsAt ?? null,
      cancelledAt: options.cancelledAt ?? null,
      createdByAdminUserId: owner.adminUserId,
      updatedByAdminUserId: owner.adminUserId,
    },
  });
}

async function audit(
  actorValue: Actor,
  action: string,
  targetType: string,
  targetId: string,
  occurredAt: Date,
) {
  await prisma.auditEvent.create({
    data: {
      ...buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actorValue.adminUserId,
        action,
        targetType,
        targetId,
        summary: { fixture: true },
      }),
      occurredAt,
    },
  });
}

function dashboard(
  actorValue: Actor,
  input: Partial<Parameters<typeof getCommunicationsDashboard>[2]> = {},
) {
  return getCommunicationsDashboard(prisma, actorValue, {
    evaluationTime,
    upcomingUntil,
    ...input,
  });
}

describe("C5B-1 Communications Dashboard PostgreSQL read model", () => {
  let contributor: Actor;
  let editor: Actor;
  let editorWithoutNewsReview: Actor;
  let publisher: Actor;
  let manager: Actor;
  let reviewStory: Awaited<ReturnType<typeof content>>;
  let reviewNews: Awaited<ReturnType<typeof content>>;
  let approvedStory: Awaited<ReturnType<typeof content>>;
  let activeStory: Awaited<ReturnType<typeof content>>;
  let activeNews: Awaited<ReturnType<typeof content>>;
  let withdrawnStory: Awaited<ReturnType<typeof content>>;
  let privateManagerStory: Awaited<ReturnType<typeof content>>;

  beforeAll(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "publication" CASCADE`;
    contributor = await actor("contributor");
    editor = await actor("editor");
    editorWithoutNewsReview = {
      ...editor,
      capabilities: editor.capabilities.filter(
        (capability) => capability !== "news.review",
      ),
    };
    publisher = await actor("publisher");
    manager = await actor("communications-manager");

    reviewStory = await content({
      kind: "STORY",
      title: "Dashboard Story Review",
      owner: contributor,
      workflow: "IN_REVIEW",
    });
    reviewNews = await content({
      kind: "NEWS",
      title: "Dashboard News Review",
      owner: contributor,
      workflow: "IN_REVIEW",
    });
    await content({
      kind: "STORY",
      title: "Dashboard Story Review Extra",
      owner: contributor,
      workflow: "IN_REVIEW",
    });
    await content({
      kind: "STORY",
      title: "Dashboard Story Approval",
      owner: contributor,
      workflow: "PENDING_APPROVAL",
    });
    await content({
      kind: "NEWS",
      title: "Dashboard News Approval",
      owner: contributor,
      workflow: "PENDING_APPROVAL",
    });
    approvedStory = await content({
      kind: "STORY",
      title: "Dashboard Approved Story",
      owner: contributor,
      workflow: "APPROVED",
    });
    await content({
      kind: "NEWS",
      title: "Dashboard Approved News",
      owner: contributor,
      workflow: "APPROVED",
    });
    activeStory = await content({
      kind: "STORY",
      title: "Dashboard Active Story",
      owner: contributor,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
      publishedAt: new Date("2040-08-10T10:00:00Z"),
    });
    activeNews = await content({
      kind: "NEWS",
      title: "Dashboard Active News",
      owner: contributor,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
      expiresAt: new Date("2040-08-25T00:00:00Z"),
      publishedAt: new Date("2040-08-10T11:00:00Z"),
    });
    withdrawnStory = await content({
      kind: "STORY",
      title: "Dashboard Withdrawn Story",
      owner: contributor,
      workflow: "APPROVED",
      releaseState: "WITHDRAWN",
    });
    await content({
      kind: "NEWS",
      title: "Dashboard Expiring News",
      owner: contributor,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
      expiresAt: new Date("2040-08-20T00:00:00Z"),
      publishedAt: new Date("2040-08-11T11:00:00Z"),
    });
    privateManagerStory = await content({
      kind: "STORY",
      title: "Dashboard Private Manager Draft",
      owner: manager,
      workflow: "DRAFT",
    });
    await content({
      kind: "NEWS",
      title: "Dashboard Outside Window News",
      owner: contributor,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
      expiresAt: new Date("2040-09-20T00:00:00Z"),
    });
    await content({
      kind: "NEWS",
      title: "Dashboard Expired News",
      owner: contributor,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
      expiresAt: new Date("2040-08-10T00:00:00Z"),
    });
    await content({
      kind: "NEWS",
      title: "Dashboard Archived News",
      owner: contributor,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
      discoveryDisposition: "ARCHIVED",
      expiresAt: new Date("2040-08-20T00:00:00Z"),
    });
    const futureStory = await content({
      kind: "STORY",
      title: "Dashboard Future Story",
      owner: contributor,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
      publishedAt: new Date("2040-08-12T10:00:00Z"),
    });
    const futureNews = await content({
      kind: "NEWS",
      title: "Dashboard Future News",
      owner: contributor,
      workflow: "APPROVED",
      releaseState: "PUBLISHED",
      expiresAt: new Date("2040-08-28T00:00:00Z"),
    });

    await placement(
      "HOME_HERO",
      activeStory.publicationId,
      manager,
      new Date("2040-08-01T00:00:00Z"),
      { endsAt: new Date("2040-08-22T00:00:00Z") },
    );
    await placement(
      "HOME_HERO",
      futureStory.publicationId,
      manager,
      new Date("2040-08-22T00:00:00Z"),
    );
    await placement(
      "HOME_FEATURED_STORY",
      withdrawnStory.publicationId,
      manager,
      new Date("2040-08-01T00:00:00Z"),
    );
    await placement(
      "HOME_FEATURED_NEWS",
      futureNews.publicationId,
      manager,
      new Date("2040-08-21T00:00:00Z"),
    );
    const futureNewsPlacement = await placement(
      "NEWS_FEATURED",
      futureNews.publicationId,
      manager,
      new Date("2040-08-23T00:00:00Z"),
    );
    await placement(
      "NEWS_FEATURED",
      activeNews.publicationId,
      manager,
      new Date("2040-08-02T00:00:00Z"),
      { endsAt: new Date("2040-08-22T00:00:00Z") },
    );
    await placement(
      "HOME_FEATURED_NEWS",
      activeNews.publicationId,
      manager,
      new Date("2040-08-24T00:00:00Z"),
      { cancelledAt: new Date("2040-08-15T00:00:00Z") },
    );

    await audit(
      contributor,
      "story.submit",
      "Story",
      reviewStory.storyId!,
      new Date("2040-08-16T11:00:00Z"),
    );
    await audit(
      manager,
      "story.release",
      "Story",
      activeStory.storyId!,
      new Date("2040-08-16T10:00:00Z"),
    );
    await audit(
      manager,
      "news.approve",
      "NewsItem",
      reviewNews.newsId!,
      new Date("2040-08-16T09:00:00Z"),
    );
    await audit(
      manager,
      "placement.assigned",
      "ContentPlacement",
      futureNewsPlacement.id,
      new Date("2040-08-16T08:00:00Z"),
    );
    await audit(
      manager,
      "story.revision.create",
      "Story",
      reviewStory.storyId!,
      new Date("2040-08-16T07:00:00Z"),
    );
    await audit(
      manager,
      "story.submit",
      "Story",
      approvedStory.storyId!,
      new Date("2040-08-16T06:00:00Z"),
    );
    await audit(
      manager,
      "story.create",
      "Story",
      privateManagerStory.storyId!,
      new Date("2040-08-16T05:00:00Z"),
    );
  });

  afterAll(async () => {
    const dashboardAdmins = await prisma.adminUser.findMany({
      where: { authUser: { id: { startsWith: "dashboard-" } } },
      select: { id: true },
    });
    const adminIds = dashboardAdmins.map((admin) => admin.id);
    await prisma.contentPlacement.deleteMany({
      where: { createdByAdminUserId: { in: adminIds } },
    });
  });

  it("requires Dashboard capability and omits unauthorized modules", async () => {
    await expect(
      getCommunicationsDashboard(prisma, contributor, { evaluationTime }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    const editorDashboard = await dashboard(editor);
    expect(editorDashboard.currentCuration).toBeNull();
    expect(editorDashboard.needsAttention).not.toBeNull();
    expect(editorDashboard.recentActivity).toBeDefined();
  });

  it("reuses Queue counts/order/visibility and bounds previews", async () => {
    const managerDashboard = await dashboard(manager, {
      needsAttentionPreviewLimit: 1,
    });
    expect(managerDashboard.needsAttention?.groups[0]).toMatchObject({
      key: "NEEDS_REVIEW",
      count: 3,
    });
    expect(managerDashboard.needsAttention?.groups[0].items).toHaveLength(1);
    const queueReview = await getPublicationQueue(prisma, manager, {
      view: "NEEDS_REVIEW",
      now: evaluationTime,
      pageSize: 1,
    });
    expect(managerDashboard.needsAttention?.groups[0].items[0]?.headline).toBe(
      queueReview.items[0]?.headline,
    );
    expect(managerDashboard.needsAttention?.groups[1].count).toBe(2);
    expect(managerDashboard.needsAttention?.groups[2].count).toBe(3);
    const storyOnly = await dashboard(editorWithoutNewsReview);
    expect(storyOnly.needsAttention?.groups[0].count).toBe(2);
    expect(
      storyOnly.needsAttention?.groups[0].items.map(
        (item) => item.publicationKind,
      ),
    ).toEqual(["STORY", "STORY"]);
    expect(storyOnly.needsAttention?.groups[1].count).toBe(0);
    const publisherDashboard = await dashboard(publisher);
    expect(publisherDashboard.needsAttention?.groups[1].count).toBe(0);
    expect(publisherDashboard.needsAttention?.groups[2].count).toBe(3);
    const contributorDashboard = await dashboard({
      ...contributor,
      capabilities: [
        ...contributor.capabilities,
        "communications.dashboard.read",
      ],
    });
    expect(contributorDashboard.needsAttention).toBeNull();
  });

  it("returns only authorized, authoritative Upcoming placements and News expirations", async () => {
    const managerDashboard = await dashboard(manager);
    const items = managerDashboard.upcoming?.items ?? [];
    expect(
      items.filter((item) => item.kind === "PLACEMENT_ACTIVATION"),
    ).toHaveLength(3);
    expect(
      items
        .filter((item) => item.kind === "NEWS_EXPIRATION")
        .map((item) => item.headline),
    ).toContain("Dashboard Expiring News");
    expect(
      items.map((item) =>
        item.kind === "PLACEMENT_ACTIVATION" ? item.startsAt : item.expiresAt,
      ),
    ).toEqual(
      [...items]
        .map((item) =>
          item.kind === "PLACEMENT_ACTIVATION" ? item.startsAt : item.expiresAt,
        )
        .sort((left, right) => left.getTime() - right.getTime()),
    );
    expect(
      items.map((item) =>
        item.kind === "PLACEMENT_ACTIVATION" ? item.headline : item.headline,
      ),
    ).not.toContain("Dashboard Outside Window News");
    const editorDashboard = await dashboard(editor);
    expect(
      editorDashboard.upcoming?.items.every(
        (item) => item.kind === "NEWS_EXPIRATION",
      ),
    ).toBe(true);
    expect(
      editorDashboard.upcoming?.items.map((item) => item.headline),
    ).toContain("Dashboard Expiring News");
  });

  it("covers the four code-owned Current Curation definitions and derived statuses", async () => {
    const managerDashboard = await dashboard(manager);
    const slots = managerDashboard.currentCuration?.slots ?? [];
    expect(slots.map((slot) => slot.placementKey)).toEqual([
      "HOME_HERO",
      "HOME_FEATURED_STORY",
      "HOME_FEATURED_NEWS",
      "NEWS_FEATURED",
    ]);
    expect(slots.map((slot) => slot.status)).toEqual([
      "CURRENT_AND_UPCOMING",
      "CONFIGURED_BUT_INEFFECTIVE",
      "UPCOMING_ONLY",
      "CURRENT_AND_UPCOMING",
    ]);
    expect(slots[0]?.current?.headline).toBe("Dashboard Active Story");
    expect(slots[1]?.current?.headline).toBeNull();
    expect(slots[2]?.upcoming?.targetKind).toBe("NEWS");
    expect(slots[0]?.current).not.toHaveProperty("body");
    expect(slots[0]?.current).not.toHaveProperty("revision");
    const later = await dashboard(manager, {
      evaluationTime: new Date("2040-08-23T12:00:00.000Z"),
      upcomingUntil: new Date("2040-08-30T12:00:00.000Z"),
    });
    expect(later.currentCuration?.slots[0]?.status).toBe("ACTIVE");
  });

  it("maps allowlisted Recent Activity with subject authorization, names, paths, and redaction", async () => {
    const managerDashboard = await dashboard(manager, {
      recentActivityLimit: 4,
    });
    const activity = managerDashboard.recentActivity.items;
    expect(activity).toHaveLength(4);
    expect(activity.map((item) => item.action)).toEqual([
      "story.submit",
      "story.release",
      "news.approve",
      "placement.assigned",
    ]);
    expect(activity[0]).toMatchObject({
      subjectKind: "STORY",
      detailPath: `/admin/communications/stories/${reviewStory.storyId}`,
      actorDisplayName: expect.stringContaining("Dashboard Contributor"),
    });
    expect(activity.find((item) => item.kind === "PLACEMENT")?.detailPath).toBe(
      "/admin/communications/homepage",
    );
    expect(activity).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "story.revision.create" }),
      ]),
    );
    const serialized = JSON.stringify(managerDashboard);
    expect(serialized).not.toContain("@example.org");
    expect(serialized).not.toContain("fixture");
    expect(serialized).not.toContain("Dashboard fixture");
    const contributorDashboard = await dashboard({
      ...contributor,
      capabilities: [
        ...contributor.capabilities,
        "communications.dashboard.read",
      ],
    });
    expect(
      contributorDashboard.recentActivity.items.map((item) => item.headline),
    ).not.toContain("Dashboard Private Manager Draft");
  });

  it("does not mutate Queue, placement, or audit state", async () => {
    const beforeQueue = await getPublicationQueue(prisma, manager, {
      view: "ALL",
      now: evaluationTime,
      pageSize: 100,
    });
    const beforePlacements = await prisma.contentPlacement.count();
    const beforeAudit = await prisma.auditEvent.count();
    await dashboard(manager);
    const afterQueue = await getPublicationQueue(prisma, manager, {
      view: "ALL",
      now: evaluationTime,
      pageSize: 100,
    });
    expect(afterQueue.summary).toEqual(beforeQueue.summary);
    expect(afterQueue.items.map((item) => item.publicationId)).toEqual(
      beforeQueue.items.map((item) => item.publicationId),
    );
    expect(await prisma.contentPlacement.count()).toBe(beforePlacements);
    expect(await prisma.auditEvent.count()).toBe(beforeAudit);
  });
});
