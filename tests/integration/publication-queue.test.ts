import { createHash, randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import type { Capability } from "@/platform/auth/capabilities";
import {
  getPublicationQueue,
  listPublicationQueueOwnerOptions,
  type PublicationQueueItem,
} from "@/modules/communications/queue";
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
type Workflow =
  "DRAFT" | "IN_REVIEW" | "CHANGES_REQUESTED" | "PENDING_APPROVAL" | "APPROVED";

const now = new Date("2026-08-15T12:00:00.000Z");
const body = {
  schemaVersion: 1,
  root: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Queue fixture body." }],
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
      id: `queue-${suffix}`,
      name: `Queue ${role.name} ${suffix.slice(0, 6)}`,
      email: `queue-${suffix}@example.org`,
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

function hash(seed: string) {
  return createHash("sha256").update(seed).digest("hex");
}

type FixtureOptions = Readonly<{
  kind: Kind;
  title: string;
  owner: Actor;
  workflow: Workflow;
  releaseState?: "UNPUBLISHED" | "PUBLISHED" | "WITHDRAWN";
  discoveryDisposition?: "ACTIVE" | "ARCHIVED";
  revisionCreatedBy?: Actor;
  revisionCreatedAt?: Date;
  approved?: boolean;
  approvedAt?: Date;
  publishedAt?: Date;
  expiresAt?: Date | null;
  archivedAt?: Date;
  currentRevisionNumber?: number;
  publicRevisionNumber?: number;
  olderApproval?: boolean;
}>;

async function fixture(options: FixtureOptions) {
  const createdAt = options.revisionCreatedAt ?? now;
  const releaseState = options.releaseState ?? "UNPUBLISHED";
  const discoveryDisposition = options.discoveryDisposition ?? "ACTIVE";
  const publication = await prisma.publication.create({
    data: {
      kind: options.kind,
      workflowState: options.workflow,
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
  const revisionCount = options.currentRevisionNumber ?? 1;
  const revisions: Array<{
    id: string;
    contentHash: string;
    headline: string;
  }> = [];
  for (let number = 1; number <= revisionCount; number += 1) {
    const parentRevisionId = revisions.at(-1)?.id;
    const revision = await prisma.publicationRevision.create({
      data: {
        publicationId: publication.id,
        number,
        parentRevisionId: parentRevisionId ?? null,
        headline:
          number === revisionCount
            ? options.title
            : `${options.title} v${number}`,
        excerpt: `Queue excerpt ${number}.`,
        newsSummary:
          options.kind === "NEWS" ? `Queue summary ${number}.` : null,
        newsExpiresAt:
          options.kind === "NEWS" && number === revisionCount
            ? (options.expiresAt ?? null)
            : null,
        body,
        schemaVersion: 1,
        contentHash: hash(`${publication.id}:${number}:${options.title}`),
        createdByAdminUserId: (number === revisionCount
          ? (options.revisionCreatedBy ?? options.owner)
          : options.owner
        ).adminUserId,
        createdAt:
          number === revisionCount
            ? createdAt
            : new Date(createdAt.getTime() - number * 60_000),
      },
    });
    revisions.push(revision);
  }
  const current = revisions.at(-1)!;
  const approvedRevision = options.olderApproval ? revisions[0]! : current;
  await prisma.publication.update({
    where: { id: publication.id },
    data: {
      currentRevisionId: current.id,
      ...(options.approved
        ? {
            approvedRevisionId: approvedRevision.id,
            approvedContentHash: approvedRevision.contentHash,
          }
        : {}),
    },
  });
  await prisma.publicationLifecycleTransition.create({
    data: {
      publicationId: publication.id,
      dimension: "CANDIDATE_WORKFLOW",
      action: "DRAFT_CREATED",
      toState: "DRAFT",
      revisionId: current.id,
      contentHash: current.contentHash,
      actorAdminUserId: options.owner.adminUserId,
      correlationId: randomUUID(),
      occurredAt: createdAt,
    },
  });
  if (options.workflow !== "DRAFT") {
    await prisma.publicationLifecycleTransition.create({
      data: {
        publicationId: publication.id,
        dimension: "CANDIDATE_WORKFLOW",
        action: "SUBMITTED",
        fromState: "DRAFT",
        toState:
          options.workflow === "CHANGES_REQUESTED"
            ? "CHANGES_REQUESTED"
            : "IN_REVIEW",
        revisionId: current.id,
        contentHash: current.contentHash,
        actorAdminUserId: options.owner.adminUserId,
        correlationId: randomUUID(),
        occurredAt: new Date(createdAt.getTime() + 1_000),
      },
    });
  }
  if (options.workflow === "PENDING_APPROVAL") {
    await prisma.publicationLifecycleTransition.create({
      data: {
        publicationId: publication.id,
        dimension: "CANDIDATE_WORKFLOW",
        action: "SENT_FOR_APPROVAL",
        fromState: "IN_REVIEW",
        toState: "PENDING_APPROVAL",
        revisionId: current.id,
        contentHash: current.contentHash,
        actorAdminUserId: options.owner.adminUserId,
        correlationId: randomUUID(),
        occurredAt: new Date(createdAt.getTime() + 2_000),
      },
    });
  }
  if (options.approved) {
    await prisma.publicationApproval.create({
      data: {
        publicationId: publication.id,
        revisionId: approvedRevision.id,
        contentHash: approvedRevision.contentHash,
        approvedByAdminUserId:
          options.revisionCreatedBy?.adminUserId ?? options.owner.adminUserId,
        approvedAt: options.approvedAt ?? new Date(createdAt.getTime() + 2_000),
      },
    });
    await prisma.publicationLifecycleTransition.create({
      data: {
        publicationId: publication.id,
        dimension: "CANDIDATE_WORKFLOW",
        action: "APPROVED",
        fromState: "PENDING_APPROVAL",
        toState: "APPROVED",
        revisionId: approvedRevision.id,
        contentHash: approvedRevision.contentHash,
        actorAdminUserId:
          options.revisionCreatedBy?.adminUserId ?? options.owner.adminUserId,
        correlationId: randomUUID(),
        occurredAt: options.approvedAt ?? new Date(createdAt.getTime() + 2_000),
      },
    });
  }
  if (releaseState === "PUBLISHED") {
    const publicRevision =
      revisions[(options.publicRevisionNumber ?? revisionCount) - 1]!;
    const snapshot = await prisma.publicationSnapshot.create({
      data: {
        publicationId: publication.id,
        sourceRevisionId: publicRevision.id,
        sourceContentHash: publicRevision.contentHash,
        slug: `queue-${randomUUID()}`,
        payload: { headline: publicRevision.headline, body },
        activatedAt:
          options.publishedAt ?? new Date(createdAt.getTime() + 3_000),
      },
    });
    if (options.kind === "STORY") {
      await prisma.publicStoryProjection.create({
        data: {
          publicationId: publication.id,
          snapshotId: snapshot.id,
          slug: snapshot.slug,
          headline: publicRevision.headline,
          deck: "Queue deck.",
          excerpt: "Queue excerpt.",
          body,
          publishedAt:
            options.publishedAt ?? new Date(createdAt.getTime() + 3_000),
        },
      });
    } else {
      await prisma.publicNewsProjection.create({
        data: {
          publicationId: publication.id,
          snapshotId: snapshot.id,
          slug: snapshot.slug,
          headline: publicRevision.headline,
          summary: "Queue summary.",
          body,
          publishedAt:
            options.publishedAt ?? new Date(createdAt.getTime() + 3_000),
          expiresAt:
            options.publicRevisionNumber &&
            options.publicRevisionNumber !== revisionCount
              ? null
              : (options.expiresAt ?? null),
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
        revisionId: current.id,
        contentHash: current.contentHash,
        actorAdminUserId: options.owner.adminUserId,
        correlationId: randomUUID(),
        occurredAt: options.archivedAt ?? new Date(createdAt.getTime() + 4_000),
      },
    });
  }
  return {
    publicationId: publication.id,
    storyId: publication.story?.id,
    newsId: publication.newsItem?.id,
  };
}

function titles(items: readonly PublicationQueueItem[]) {
  return items.map((item) => item.headline);
}

async function allPages(
  actorValue: Actor,
  view: "ALL" | "RECENTLY_PUBLISHED",
  ownerId?: string,
) {
  const first = await getPublicationQueue(prisma, actorValue, {
    view,
    page: 1,
    pageSize: 2,
    ...(ownerId ? { filters: { editorialOwnerAdminUserId: ownerId } } : {}),
    now,
  });
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page += 1) {
    const next = await getPublicationQueue(prisma, actorValue, {
      view,
      page,
      pageSize: 2,
      ...(ownerId ? { filters: { editorialOwnerAdminUserId: ownerId } } : {}),
      now,
    });
    items.push(...next.items);
  }
  return items;
}

describe("C5A-1 Publication Queue PostgreSQL read model", () => {
  let contributor: Actor;
  let editor: Actor;
  let publisher: Actor;
  let manager: Actor;
  let otherOwnerDraftTitle: string;
  let successorTitle: string;
  let releasedTitle: string;
  let expiredTitle: string;
  let archivedTitle: string;

  beforeAll(async () => {
    contributor = await actor("contributor");
    editor = await actor("editor");
    publisher = await actor("publisher");
    manager = await actor("communications-manager");
    await fixture({
      kind: "STORY",
      title: "My Story Draft",
      owner: contributor,
      workflow: "DRAFT",
    });
    await fixture({
      kind: "STORY",
      title: "My Story Changes",
      owner: contributor,
      workflow: "CHANGES_REQUESTED",
    });
    await fixture({
      kind: "NEWS",
      title: "My News Draft",
      owner: contributor,
      workflow: "DRAFT",
    });
    otherOwnerDraftTitle = "Other Owner Draft";
    await fixture({
      kind: "STORY",
      title: otherOwnerDraftTitle,
      owner: manager,
      workflow: "DRAFT",
    });
    await fixture({
      kind: "STORY",
      title: "Story Needs Review",
      owner: contributor,
      workflow: "IN_REVIEW",
    });
    await fixture({
      kind: "NEWS",
      title: "News Needs Review",
      owner: contributor,
      workflow: "IN_REVIEW",
    });
    await fixture({
      kind: "STORY",
      title: "Story Needs Approval",
      owner: contributor,
      workflow: "PENDING_APPROVAL",
    });
    await fixture({
      kind: "NEWS",
      title: "News Needs Approval",
      owner: contributor,
      workflow: "PENDING_APPROVAL",
    });
    await fixture({
      kind: "STORY",
      title: "Manager Self Approval",
      owner: manager,
      workflow: "PENDING_APPROVAL",
    });
    await fixture({
      kind: "STORY",
      title: "Approved Story",
      owner: contributor,
      workflow: "APPROVED",
      approved: true,
      approvedAt: new Date("2026-08-10T10:00:00Z"),
    });
    await fixture({
      kind: "NEWS",
      title: "Approved News",
      owner: contributor,
      workflow: "APPROVED",
      approved: true,
      approvedAt: new Date("2026-08-10T11:00:00Z"),
    });
    successorTitle = "Approved Successor Story";
    await fixture({
      kind: "STORY",
      title: successorTitle,
      owner: contributor,
      workflow: "APPROVED",
      approved: true,
      currentRevisionNumber: 2,
      publicRevisionNumber: 1,
      publishedAt: new Date("2026-08-11T10:00:00Z"),
      approvedAt: new Date("2026-08-12T10:00:00Z"),
    });
    releasedTitle = "Released Story";
    await fixture({
      kind: "STORY",
      title: releasedTitle,
      owner: contributor,
      workflow: "APPROVED",
      approved: true,
      releaseState: "PUBLISHED",
      publishedAt: new Date("2026-08-14T10:00:00Z"),
      approvedAt: new Date("2026-08-13T10:00:00Z"),
    });
    await fixture({
      kind: "NEWS",
      title: "Released News",
      owner: contributor,
      workflow: "APPROVED",
      approved: true,
      releaseState: "PUBLISHED",
      publishedAt: new Date("2026-08-14T11:00:00Z"),
      approvedAt: new Date("2026-08-13T11:00:00Z"),
      expiresAt: new Date("2026-08-20T00:00:00Z"),
    });
    expiredTitle = "Expired News";
    await fixture({
      kind: "NEWS",
      title: expiredTitle,
      owner: contributor,
      workflow: "APPROVED",
      approved: true,
      releaseState: "PUBLISHED",
      publishedAt: new Date("2026-08-12T11:00:00Z"),
      approvedAt: new Date("2026-08-11T11:00:00Z"),
      expiresAt: new Date("2026-08-14T00:00:00Z"),
    });
    await fixture({
      kind: "NEWS",
      title: "Withdrawn News",
      owner: contributor,
      workflow: "APPROVED",
      approved: true,
      releaseState: "WITHDRAWN",
    });
    await fixture({
      kind: "STORY",
      title: "Withdrawn Story",
      owner: contributor,
      workflow: "APPROVED",
      approved: true,
      releaseState: "WITHDRAWN",
    });
    archivedTitle = "Archived Story";
    await fixture({
      kind: "STORY",
      title: archivedTitle,
      owner: contributor,
      workflow: "APPROVED",
      approved: true,
      releaseState: "PUBLISHED",
      discoveryDisposition: "ARCHIVED",
      publishedAt: new Date("2026-08-10T10:00:00Z"),
      archivedAt: new Date("2026-08-14T12:00:00Z"),
    });
    await fixture({
      kind: "NEWS",
      title: "Archived News",
      owner: contributor,
      workflow: "APPROVED",
      approved: true,
      releaseState: "PUBLISHED",
      discoveryDisposition: "ARCHIVED",
      publishedAt: new Date("2026-08-10T11:00:00Z"),
      archivedAt: new Date("2026-08-14T13:00:00Z"),
      expiresAt: new Date("2026-08-13T00:00:00Z"),
    });
    await fixture({
      kind: "STORY",
      title: "Stale Approval",
      owner: contributor,
      workflow: "APPROVED",
      approved: true,
      currentRevisionNumber: 2,
      olderApproval: true,
    });
    await fixture({
      kind: "NEWS",
      title: "Future Expiration News",
      owner: contributor,
      workflow: "APPROVED",
      approved: true,
      releaseState: "PUBLISHED",
      publishedAt: new Date("2026-08-09T11:00:00Z"),
      expiresAt: new Date("2026-08-16T00:00:00Z"),
    });
  });

  it("requires queue capability and enforces own/any draft visibility", async () => {
    await expect(
      getPublicationQueue(
        prisma,
        { adminUserId: manager.adminUserId, capabilities: [] },
        { view: "ALL", now },
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
    const own = await getPublicationQueue(prisma, contributor, {
      view: "MY_DRAFTS",
      now,
    });
    expect(titles(own.items)).toEqual(
      expect.arrayContaining([
        "My Story Draft",
        "My Story Changes",
        "My News Draft",
      ]),
    );
    expect(titles(own.items)).not.toContain(otherOwnerDraftTitle);
    const broad = await getPublicationQueue(prisma, editor, {
      view: "MY_DRAFTS",
      now,
    });
    expect(titles(broad.items)).toContain(otherOwnerDraftTitle);
    expect(titles(own.items)).not.toContain("Story Needs Review");
  });

  it("filters review and approval queues by typed capability", async () => {
    const review = await getPublicationQueue(prisma, editor, {
      view: "NEEDS_REVIEW",
      filters: { editorialOwnerAdminUserId: contributor.adminUserId },
      now,
    });
    expect(titles(review.items)).toEqual(
      expect.arrayContaining(["Story Needs Review", "News Needs Review"]),
    );
    expect(titles(review.items)).not.toContain("My Story Draft");
    const contributorReview = await getPublicationQueue(prisma, contributor, {
      view: "NEEDS_REVIEW",
      now,
    });
    expect(contributorReview.items).toHaveLength(0);
    const publisherReview = await getPublicationQueue(prisma, publisher, {
      view: "NEEDS_REVIEW",
      now,
    });
    expect(publisherReview.items).toHaveLength(0);
    const approval = await getPublicationQueue(prisma, manager, {
      view: "NEEDS_APPROVAL",
      filters: { editorialOwnerAdminUserId: contributor.adminUserId },
      now,
    });
    expect(titles(approval.items)).toEqual(
      expect.arrayContaining(["Story Needs Approval", "News Needs Approval"]),
    );
    const selfResult = await getPublicationQueue(prisma, manager, {
      view: "NEEDS_APPROVAL",
      filters: { editorialOwnerAdminUserId: manager.adminUserId },
      now,
    });
    const self = selfResult.items.find(
      (item) => item.headline === "Manager Self Approval",
    );
    expect(self).toMatchObject({
      canOpenForApproval: false,
      approvalBlockedReasonCode: "SELF_APPROVAL",
    });
    expect(titles(approval.items)).not.toContain("News Needs Review");
    expect(titles(approval.items)).not.toContain("Approved Story");
    const publisherApproval = await getPublicationQueue(prisma, publisher, {
      view: "NEEDS_APPROVAL",
      now,
    });
    expect(publisherApproval.items).toHaveLength(0);
    expect(publisherApproval.summary.needsApproval).toBe(
      publisherApproval.total,
    );
    expect(review.summary.needsReview).toBe(review.total);
  });

  it("classifies exact approved current candidates, including an unreleased successor", async () => {
    const result = await getPublicationQueue(prisma, manager, {
      view: "APPROVED_UNRELEASED",
      filters: { editorialOwnerAdminUserId: contributor.adminUserId },
      now,
    });
    expect(titles(result.items)).toEqual(
      expect.arrayContaining([
        "Approved Story",
        "Approved News",
        successorTitle,
      ]),
    );
    expect(titles(result.items)).not.toContain(releasedTitle);
    expect(titles(result.items)).not.toContain("Stale Approval");
  });

  it("resolves release, expiration, and archive views at the injected clock", async () => {
    const recent = await getPublicationQueue(prisma, manager, {
      view: "RECENTLY_PUBLISHED",
      filters: { editorialOwnerAdminUserId: contributor.adminUserId },
      now,
    });
    expect(titles(recent.items)).toEqual(
      expect.arrayContaining([
        releasedTitle,
        "Released News",
        "Future Expiration News",
      ]),
    );
    expect(titles(recent.items)).not.toContain(expiredTitle);
    expect(titles(recent.items)).not.toContain("Archived Story");
    expect(titles(recent.items)).not.toContain("Withdrawn Story");
    expect(recent.items[0]?.publishedAt).toEqual(
      new Date("2026-08-14T11:00:00Z"),
    );
    const expired = await getPublicationQueue(prisma, manager, {
      view: "EXPIRED_NEWS",
      filters: { editorialOwnerAdminUserId: contributor.adminUserId },
      now,
    });
    expect(titles(expired.items)).toContain(expiredTitle);
    expect(titles(expired.items)).not.toContain("Released News");
    expect(titles(expired.items)).not.toContain("Withdrawn News");
    const future = await getPublicationQueue(prisma, manager, {
      view: "EXPIRED_NEWS",
      filters: { editorialOwnerAdminUserId: contributor.adminUserId },
      now: new Date("2026-08-17T00:00:00Z"),
    });
    expect(titles(future.items)).toContain("Future Expiration News");
    const archived = await getPublicationQueue(prisma, manager, {
      view: "ARCHIVED",
      filters: { editorialOwnerAdminUserId: contributor.adminUserId },
      now,
    });
    expect(titles(archived.items)).toEqual(
      expect.arrayContaining([archivedTitle, "Archived News"]),
    );
    expect(titles(archived.items)).not.toContain(releasedTitle);
    const contributorArchived = await getPublicationQueue(prisma, contributor, {
      view: "ARCHIVED",
      now,
    });
    expect(contributorArchived.items).toHaveLength(0);
    const earlierExpired = await getPublicationQueue(prisma, manager, {
      view: "EXPIRED_NEWS",
      filters: { editorialOwnerAdminUserId: contributor.adminUserId },
      now: new Date("2026-08-13T00:00:00Z"),
    });
    expect(expired.total).toBeGreaterThan(earlierExpired.total);
  });

  it("supports typed filters, authorized owner filters, stable pagination, counts, and safe DTOs", async () => {
    const storyOnly = await getPublicationQueue(prisma, manager, {
      view: "ALL",
      filters: {
        kind: "STORY",
        editorialOwnerAdminUserId: contributor.adminUserId,
      },
      now,
    });
    expect(
      storyOnly.items.every((item) => item.publicationKind === "STORY"),
    ).toBe(true);
    const newsOnly = await getPublicationQueue(prisma, manager, {
      view: "ALL",
      filters: {
        kind: "NEWS",
        editorialOwnerAdminUserId: contributor.adminUserId,
      },
      now,
    });
    expect(
      newsOnly.items.every((item) => item.publicationKind === "NEWS"),
    ).toBe(true);
    const owned = await getPublicationQueue(prisma, manager, {
      view: "MY_DRAFTS",
      filters: { editorialOwnerAdminUserId: contributor.adminUserId },
      now,
    });
    expect(
      owned.items.every(
        (item) => item.editorialOwner?.adminUserId === contributor.adminUserId,
      ),
    ).toBe(true);
    await expect(
      getPublicationQueue(prisma, contributor, {
        view: "ALL",
        filters: { editorialOwnerAdminUserId: manager.adminUserId },
        now,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    const pages = await allPages(manager, "ALL", contributor.adminUserId);
    expect(new Set(pages.map((item) => item.publicationId)).size).toBe(
      pages.length,
    );
    expect(pages.length).toBeGreaterThan(4);
    const page = await getPublicationQueue(prisma, manager, {
      view: "ALL",
      filters: { editorialOwnerAdminUserId: contributor.adminUserId },
      page: 1,
      pageSize: 3,
      now,
    });
    expect(page.total).toBe(pages.length);
    expect(page.hasNextPage).toBe(true);
    expect(page.summary.myDrafts).toBeGreaterThan(0);
    const expectedCounts = {
      all: pages.length,
      myDrafts: (
        await getPublicationQueue(prisma, manager, {
          view: "MY_DRAFTS",
          filters: { editorialOwnerAdminUserId: contributor.adminUserId },
          now,
        })
      ).total,
      needsReview: (
        await getPublicationQueue(prisma, manager, {
          view: "NEEDS_REVIEW",
          filters: { editorialOwnerAdminUserId: contributor.adminUserId },
          now,
        })
      ).total,
      needsApproval: (
        await getPublicationQueue(prisma, manager, {
          view: "NEEDS_APPROVAL",
          filters: { editorialOwnerAdminUserId: contributor.adminUserId },
          now,
        })
      ).total,
      approvedUnreleased: (
        await getPublicationQueue(prisma, manager, {
          view: "APPROVED_UNRELEASED",
          filters: { editorialOwnerAdminUserId: contributor.adminUserId },
          now,
        })
      ).total,
      recentlyPublished: (
        await getPublicationQueue(prisma, manager, {
          view: "RECENTLY_PUBLISHED",
          filters: { editorialOwnerAdminUserId: contributor.adminUserId },
          now,
        })
      ).total,
      expiredNews: (
        await getPublicationQueue(prisma, manager, {
          view: "EXPIRED_NEWS",
          filters: { editorialOwnerAdminUserId: contributor.adminUserId },
          now,
        })
      ).total,
      archived: (
        await getPublicationQueue(prisma, manager, {
          view: "ARCHIVED",
          filters: { editorialOwnerAdminUserId: contributor.adminUserId },
          now,
        })
      ).total,
    };
    expect(page.summary).toEqual(expectedCounts);
    const repeatedPages = await allPages(
      manager,
      "ALL",
      contributor.adminUserId,
    );
    expect(titles(repeatedPages)).toEqual(titles(pages));
    const keys = Object.keys(page.items[0] ?? {}).sort();
    expect(keys).toEqual([
      "approvalBlockedReasonCode",
      "approvedAt",
      "archivedAt",
      "canOpenForApproval",
      "currentRevisionNumber",
      "detailPath",
      "discoveryDisposition",
      "editorialOwner",
      "expiresAt",
      "headline",
      "newsAvailability",
      "publicationId",
      "publicationKind",
      "publishedAt",
      "releaseState",
      "submittedAt",
      "updatedAt",
      "workflowState",
    ]);
    for (const item of page.items) {
      expect(item).not.toHaveProperty("body");
      expect(item).not.toHaveProperty("email");
      expect(item).not.toHaveProperty("approval");
      expect(item.detailPath).toMatch(
        /^\/admin\/communications\/(stories|news)\//,
      );
    }
  });

  it("limits owner options to broader readers and exposes the ALL count", async () => {
    const managerOwners = await listPublicationQueueOwnerOptions(
      prisma,
      manager,
      now,
    );
    expect(managerOwners).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          adminUserId: contributor.adminUserId,
          displayName: expect.any(String),
        }),
      ]),
    );
    await expect(
      listPublicationQueueOwnerOptions(prisma, contributor, now),
    ).resolves.toEqual([]);
    const all = await getPublicationQueue(prisma, manager, {
      view: "ALL",
      filters: { editorialOwnerAdminUserId: contributor.adminUserId },
      now,
    });
    expect(all.summary.all).toBe(all.total);
  });
});
