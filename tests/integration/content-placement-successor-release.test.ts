import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Capability } from "@/platform/auth/capabilities";
import { PreconditionError } from "@/platform/errors/app-error";
import {
  approveNews,
  createNews,
  getFeaturedNews,
  newsDocumentFromPlainText,
  releaseNews,
  saveNewsRevision,
  sendNewsForApproval,
  submitNews,
} from "@/modules/communications/news";
import {
  approveStory,
  createStory,
  getPublicStoryBySlug,
  releaseStory,
  saveStoryRevision,
  sendStoryForApproval,
  storyDocumentFromPlainText,
  submitStory,
} from "@/modules/communications/stories";
import {
  assignPlacement,
  getEffectivePlacement,
} from "@/modules/communications/placements";
import { assertDestructiveTestDatabaseSafety } from "../support/destructive-test-database";

const target = assertDestructiveTestDatabaseSafety();
const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("@/generated/prisma/client");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: target.databaseUrl }),
});

type Actor = { adminUserId: string; capabilities: readonly Capability[] };
const PLACEMENT_AUDIT_ACTIONS = [
  "placement.assigned",
  "placement.replaced",
  "placement.cleared",
  "placement.cancelled",
] as const;
const STORY_START = new Date("2030-05-01T12:00:00.000Z");
const NEWS_START = new Date("2030-05-01T12:00:00.000Z");
const NEWS_REVISION_ONE_EXPIRY = new Date("2030-06-01T12:00:00.000Z");
const NEWS_REVISION_TWO_EXPIRY = new Date("2030-08-01T12:00:00.000Z");
const EVALUATION_BEFORE_REVISION_ONE_EXPIRY = new Date(
  "2030-05-15T12:00:00.000Z",
);
const EVALUATION_AFTER_REVISION_ONE_EXPIRY = new Date(
  "2030-07-01T12:00:00.000Z",
);
const EXPIRED_SUCCESSOR_EXPIRY = new Date("2030-01-01T12:00:00.000Z");

async function actor(roleKey: string): Promise<Actor> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  const id = `c4-2a-3a-${randomUUID()}`;
  await prisma.user.create({
    data: {
      id,
      name: "C4.2A-3A",
      email: `${id}@example.org`,
      emailVerified: true,
      workspaceDomain: "example.org",
    },
  });
  const admin = await prisma.adminUser.create({
    data: { authUserId: id, status: "ACTIVE" },
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

async function placementAuditCount() {
  return prisma.auditEvent.count({
    where: {
      targetType: "ContentPlacement",
      action: { in: [...PLACEMENT_AUDIT_ACTIONS] },
    },
  });
}

async function placementIdentity(ids: string[]) {
  return prisma.contentPlacement.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      key: true,
      publicationId: true,
      startsAt: true,
      endsAt: true,
      version: true,
      cancelledAt: true,
    },
  });
}

function expectPublicPlacementShape(value: unknown) {
  expect(value).toBeTruthy();
  const resolved = value as {
    placement: Record<string, unknown>;
    story: Record<string, unknown> | null;
    news: Record<string, unknown> | null;
  };
  expect(Object.keys(resolved).sort()).toEqual(["news", "placement", "story"]);
  expect(Object.keys(resolved.placement).sort()).toEqual([
    "endsAt",
    "id",
    "key",
    "publicationId",
    "startsAt",
  ]);
  for (const item of [resolved.story, resolved.news]) {
    if (!item) continue;
    expect(Object.keys(item)).not.toContain("publicationId");
    expect(Object.keys(item)).not.toContain("revisionId");
    expect(Object.keys(item)).not.toContain("contentHash");
    expect(Object.keys(item)).not.toContain("workflowState");
    expect(Object.keys(item)).not.toContain("approval");
  }
  return resolved;
}

async function releaseInitialStory() {
  const contributor = await actor("contributor");
  const editor = await actor("editor");
  const manager = await actor("communications-manager");
  const created = await createStory(prisma, contributor, {
    headline: "Original placed Story",
    deck: "Original deck",
    excerpt: "Original excerpt",
    body: storyDocumentFromPlainText("Original public Story body"),
  });
  const submitted = await submitStory(prisma, contributor, {
    storyId: created.storyId,
    expectedVersion: created.version,
    expectedContentHash: created.currentRevision.contentHash,
  });
  const pending = await sendStoryForApproval(prisma, editor, {
    storyId: created.storyId,
    expectedVersion: submitted.version,
    expectedContentHash: submitted.currentRevision.contentHash,
  });
  const approved = await approveStory(prisma, manager, {
    storyId: created.storyId,
    expectedVersion: pending.version,
    expectedContentHash: pending.currentRevision.contentHash,
  });
  const released = await releaseStory(prisma, manager, {
    storyId: created.storyId,
    expectedVersion: approved.version,
    expectedContentHash: approved.currentRevision.contentHash,
    slug: `original-story-${randomUUID()}`,
  });
  return { contributor, editor, manager, created, released };
}

async function releaseInitialNews() {
  const contributor = await actor("contributor");
  const editor = await actor("editor");
  const manager = await actor("communications-manager");
  const created = await createNews(prisma, contributor, {
    headline: "Original placed News",
    summary: "Original summary",
    body: newsDocumentFromPlainText("Original public News body"),
    expiresAt: NEWS_REVISION_ONE_EXPIRY,
  });
  const submitted = await submitNews(prisma, contributor, {
    newsId: created.newsId,
    expectedVersion: created.version,
    expectedContentHash: created.currentRevision.contentHash,
  });
  const pending = await sendNewsForApproval(prisma, editor, {
    newsId: created.newsId,
    expectedVersion: submitted.version,
    expectedContentHash: submitted.currentRevision.contentHash,
  });
  const approved = await approveNews(prisma, manager, {
    newsId: created.newsId,
    expectedVersion: pending.version,
    expectedContentHash: pending.currentRevision.contentHash,
  });
  const released = await releaseNews(prisma, manager, {
    newsId: created.newsId,
    expectedVersion: approved.version,
    expectedContentHash: approved.currentRevision.contentHash,
    slug: `original-news-${randomUUID()}`,
  });
  return { contributor, editor, manager, created, released };
}

beforeAll(async () => {
  await prisma.role.findUniqueOrThrow({ where: { key: "editor" } });
  await prisma.role.findUniqueOrThrow({
    where: { key: "communications-manager" },
  });
});

beforeEach(async () => {
  await prisma.contentPlacement.deleteMany();
});

afterAll(async () => {
  await prisma.contentPlacement.deleteMany();
  await prisma.$disconnect();
});

describe("C4.2A-3A placed successor publication releases", () => {
  it("updates Story placements only when the approved successor is released", async () => {
    const fixture = await releaseInitialStory();
    const hero = await assignPlacement(prisma, fixture.manager, {
      key: "HOME_HERO",
      publicationId: fixture.released.publicationId,
      startsAt: STORY_START,
    });
    const featured = await assignPlacement(prisma, fixture.manager, {
      key: "HOME_FEATURED_STORY",
      publicationId: fixture.released.publicationId,
      startsAt: STORY_START,
    });
    const placementIds = [hero.id, featured.id];
    const beforeIdentity = await placementIdentity(placementIds);
    const beforePlacementAudits = await placementAuditCount();
    const beforeReleaseAudits = await prisma.auditEvent.count({
      where: {
        action: "story.release",
        targetType: "Story",
        targetId: fixture.created.storyId,
      },
    });
    const initialSnapshots = await prisma.publicationSnapshot.findMany({
      where: { publicationId: fixture.released.publicationId },
      orderBy: { activatedAt: "asc" },
    });
    expect(initialSnapshots).toHaveLength(1);

    const draft = await saveStoryRevision(prisma, fixture.contributor, {
      storyId: fixture.created.storyId,
      expectedVersion: fixture.released.version,
      headline: "Successor placed Story",
      deck: "Successor deck",
      excerpt: "Successor excerpt",
      body: storyDocumentFromPlainText("Successor public Story body"),
    });
    expect(
      (await getEffectivePlacement(prisma, "HOME_HERO", STORY_START))?.story
        ?.headline,
    ).toBe("Original placed Story");
    expect(
      (await getEffectivePlacement(prisma, "HOME_FEATURED_STORY", STORY_START))
        ?.story?.headline,
    ).toBe("Original placed Story");
    const submitted = await submitStory(prisma, fixture.contributor, {
      storyId: fixture.created.storyId,
      expectedVersion: draft.version,
      expectedContentHash: draft.currentRevision.contentHash,
    });
    const pending = await sendStoryForApproval(prisma, fixture.editor, {
      storyId: fixture.created.storyId,
      expectedVersion: submitted.version,
      expectedContentHash: submitted.currentRevision.contentHash,
    });
    const approved = await approveStory(prisma, fixture.manager, {
      storyId: fixture.created.storyId,
      expectedVersion: pending.version,
      expectedContentHash: pending.currentRevision.contentHash,
    });
    expect(
      (await getEffectivePlacement(prisma, "HOME_HERO", STORY_START))?.story
        ?.headline,
    ).toBe("Original placed Story");
    const released = await releaseStory(prisma, fixture.manager, {
      storyId: fixture.created.storyId,
      expectedVersion: approved.version,
      expectedContentHash: approved.currentRevision.contentHash,
      slug: `successor-story-${randomUUID()}`,
    });
    expect(released.version).toBeGreaterThan(approved.version);
    for (const key of ["HOME_HERO", "HOME_FEATURED_STORY"] as const) {
      const resolved = expectPublicPlacementShape(
        await getEffectivePlacement(prisma, key, STORY_START),
      );
      expect(resolved.story).toMatchObject({
        headline: "Successor placed Story",
        deck: "Successor deck",
        excerpt: "Successor excerpt",
      });
      expect(resolved.story?.body).toEqual(
        storyDocumentFromPlainText("Successor public Story body"),
      );
    }
    expect(await getPublicStoryBySlug(prisma, released.slug!)).toMatchObject({
      headline: "Successor placed Story",
    });
    const afterIdentity = await placementIdentity(placementIds);
    expect(afterIdentity).toEqual(beforeIdentity);
    expect(await placementAuditCount()).toBe(beforePlacementAudits);
    expect(
      await prisma.auditEvent.count({
        where: {
          action: "story.release",
          targetType: "Story",
          targetId: fixture.created.storyId,
        },
      }),
    ).toBe(beforeReleaseAudits + 1);

    const snapshots = await prisma.publicationSnapshot.findMany({
      where: { publicationId: fixture.released.publicationId },
      orderBy: { activatedAt: "asc" },
    });
    expect(snapshots).toHaveLength(2);
    const [originalSnapshot, successorSnapshot] = snapshots;
    if (!originalSnapshot || !successorSnapshot) {
      throw new Error("Expected Story successor release snapshots.");
    }
    expect(originalSnapshot.id).not.toBe(successorSnapshot.id);
    expect(originalSnapshot.payload).toMatchObject({
      headline: "Original placed Story",
    });
    expect(successorSnapshot.payload).toMatchObject({
      headline: "Successor placed Story",
    });
    await expect(
      prisma.publicationSnapshot.update({
        where: { id: originalSnapshot.id },
        data: { payload: { headline: "mutated" } },
      }),
    ).rejects.toThrow(/immutable/);
    expect(
      await prisma.publicationSnapshot.findUniqueOrThrow({
        where: { id: originalSnapshot.id },
      }),
    ).toMatchObject({ payload: { headline: "Original placed Story" } });
  });

  it("keeps a Story placement on the prior public revision after failed successor releases", async () => {
    const fixture = await releaseInitialStory();
    const placement = await assignPlacement(prisma, fixture.manager, {
      key: "HOME_FEATURED_STORY",
      publicationId: fixture.released.publicationId,
      startsAt: STORY_START,
    });
    const beforePlacementAudits = await placementAuditCount();
    const before = await getEffectivePlacement(
      prisma,
      "HOME_FEATURED_STORY",
      STORY_START,
    );
    const draft = await saveStoryRevision(prisma, fixture.contributor, {
      storyId: fixture.created.storyId,
      expectedVersion: fixture.released.version,
      headline: "Unreleased Story successor",
      deck: "Successor deck",
      excerpt: "Successor excerpt",
      body: storyDocumentFromPlainText("Unreleased successor body"),
    });
    await expect(
      releaseStory(prisma, fixture.manager, {
        storyId: fixture.created.storyId,
        expectedVersion: draft.version,
        expectedContentHash: draft.currentRevision.contentHash,
        slug: `should-not-release-story-${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(PreconditionError);
    const submitted = await submitStory(prisma, fixture.contributor, {
      storyId: fixture.created.storyId,
      expectedVersion: draft.version,
      expectedContentHash: draft.currentRevision.contentHash,
    });
    const pending = await sendStoryForApproval(prisma, fixture.editor, {
      storyId: fixture.created.storyId,
      expectedVersion: submitted.version,
      expectedContentHash: submitted.currentRevision.contentHash,
    });
    const approved = await approveStory(prisma, fixture.manager, {
      storyId: fixture.created.storyId,
      expectedVersion: pending.version,
      expectedContentHash: pending.currentRevision.contentHash,
    });
    await expect(
      releaseStory(prisma, fixture.manager, {
        storyId: fixture.created.storyId,
        expectedVersion: approved.version,
        expectedContentHash: "0".repeat(64),
        slug: `wrong-hash-story-${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(PreconditionError);
    const newerDraft = await saveStoryRevision(prisma, fixture.contributor, {
      storyId: fixture.created.storyId,
      expectedVersion: approved.version,
      headline: "Newer unapproved Story successor",
      deck: "Newest deck",
      excerpt: "Newest excerpt",
      body: storyDocumentFromPlainText("Newest unapproved successor body"),
    });
    await expect(
      releaseStory(prisma, fixture.manager, {
        storyId: fixture.created.storyId,
        expectedVersion: newerDraft.version,
        expectedContentHash: approved.currentRevision.contentHash,
        slug: `stale-approval-story-${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(PreconditionError);
    expect(
      await getEffectivePlacement(prisma, "HOME_FEATURED_STORY", STORY_START),
    ).toMatchObject({
      placement: { id: placement.id },
      story: { headline: "Original placed Story" },
    });
    expect(await placementAuditCount()).toBe(beforePlacementAudits);
    expect(
      await getEffectivePlacement(prisma, "HOME_FEATURED_STORY", STORY_START),
    ).toMatchObject({
      story: before?.story,
    });
  });

  it("updates all News placements together on successor release and resolves NEWS_FEATURED", async () => {
    const fixture = await releaseInitialNews();
    const placements = await Promise.all(
      (["HOME_HERO", "HOME_FEATURED_NEWS", "NEWS_FEATURED"] as const).map(
        (key) =>
          assignPlacement(prisma, fixture.manager, {
            key,
            publicationId: fixture.released.publicationId,
            startsAt: NEWS_START,
          }),
      ),
    );
    const beforeIdentity = await placementIdentity(
      placements.map(({ id }) => id),
    );
    const beforePlacementAudits = await placementAuditCount();
    const beforeReleaseAudits = await prisma.auditEvent.count({
      where: {
        action: "news.release",
        targetType: "NewsItem",
        targetId: fixture.created.newsId,
      },
    });
    const draft = await saveNewsRevision(prisma, fixture.contributor, {
      newsId: fixture.created.newsId,
      expectedVersion: fixture.released.version,
      headline: "Successor placed News",
      summary: "Successor summary",
      body: newsDocumentFromPlainText("Successor public News body"),
      expiresAt: NEWS_REVISION_TWO_EXPIRY,
    });
    expect(
      (await getEffectivePlacement(prisma, "NEWS_FEATURED", NEWS_START))?.news
        ?.headline,
    ).toBe("Original placed News");
    const submitted = await submitNews(prisma, fixture.contributor, {
      newsId: fixture.created.newsId,
      expectedVersion: draft.version,
      expectedContentHash: draft.currentRevision.contentHash,
    });
    const pending = await sendNewsForApproval(prisma, fixture.editor, {
      newsId: fixture.created.newsId,
      expectedVersion: submitted.version,
      expectedContentHash: submitted.currentRevision.contentHash,
    });
    const approved = await approveNews(prisma, fixture.manager, {
      newsId: fixture.created.newsId,
      expectedVersion: pending.version,
      expectedContentHash: pending.currentRevision.contentHash,
    });
    expect(
      (await getEffectivePlacement(prisma, "NEWS_FEATURED", NEWS_START))?.news,
    ).toMatchObject({
      headline: "Original placed News",
      expiresAt: NEWS_REVISION_ONE_EXPIRY,
    });
    await releaseNews(prisma, fixture.manager, {
      newsId: fixture.created.newsId,
      expectedVersion: approved.version,
      expectedContentHash: approved.currentRevision.contentHash,
      slug: `successor-news-${randomUUID()}`,
    });
    for (const key of [
      "HOME_HERO",
      "HOME_FEATURED_NEWS",
      "NEWS_FEATURED",
    ] as const) {
      const resolved = expectPublicPlacementShape(
        await getEffectivePlacement(prisma, key, NEWS_START),
      );
      expect(resolved.news).toMatchObject({
        headline: "Successor placed News",
        summary: "Successor summary",
        expiresAt: NEWS_REVISION_TWO_EXPIRY,
      });
    }
    expect(await getFeaturedNews(prisma, NEWS_START)).toMatchObject({
      headline: "Successor placed News",
      summary: "Successor summary",
    });
    expect(await placementIdentity(placements.map(({ id }) => id))).toEqual(
      beforeIdentity,
    );
    expect(await placementAuditCount()).toBe(beforePlacementAudits);
    expect(
      await prisma.auditEvent.count({
        where: {
          action: "news.release",
          targetType: "NewsItem",
          targetId: fixture.created.newsId,
        },
      }),
    ).toBe(beforeReleaseAudits + 1);
    const snapshots = await prisma.publicationSnapshot.findMany({
      where: { publicationId: fixture.released.publicationId },
      orderBy: { activatedAt: "asc" },
    });
    expect(snapshots).toHaveLength(2);
    const [originalSnapshot, successorSnapshot] = snapshots;
    if (!originalSnapshot || !successorSnapshot) {
      throw new Error("Expected News successor release snapshots.");
    }
    expect(originalSnapshot.id).not.toBe(successorSnapshot.id);
    expect(originalSnapshot.payload).toMatchObject({
      headline: "Original placed News",
    });
    expect(successorSnapshot.payload).toMatchObject({
      headline: "Successor placed News",
    });
  });

  it("uses a valid successor expiration without rewriting placement history, then makes an expired successor ineffective", async () => {
    const fixture = await releaseInitialNews();
    const placement = await assignPlacement(prisma, fixture.manager, {
      key: "HOME_FEATURED_NEWS",
      publicationId: fixture.released.publicationId,
      startsAt: NEWS_START,
    });
    const draft = await saveNewsRevision(prisma, fixture.contributor, {
      newsId: fixture.created.newsId,
      expectedVersion: fixture.released.version,
      headline: "Expiring successor News",
      summary: "Successor summary",
      body: newsDocumentFromPlainText("Expiring successor body"),
      expiresAt: NEWS_REVISION_TWO_EXPIRY,
    });
    const submitted = await submitNews(prisma, fixture.contributor, {
      newsId: fixture.created.newsId,
      expectedVersion: draft.version,
      expectedContentHash: draft.currentRevision.contentHash,
    });
    const pending = await sendNewsForApproval(prisma, fixture.editor, {
      newsId: fixture.created.newsId,
      expectedVersion: submitted.version,
      expectedContentHash: submitted.currentRevision.contentHash,
    });
    const approved = await approveNews(prisma, fixture.manager, {
      newsId: fixture.created.newsId,
      expectedVersion: pending.version,
      expectedContentHash: pending.currentRevision.contentHash,
    });
    expect(
      (
        await getEffectivePlacement(
          prisma,
          "HOME_FEATURED_NEWS",
          EVALUATION_BEFORE_REVISION_ONE_EXPIRY,
        )
      )?.news?.headline,
    ).toBe("Original placed News");
    await releaseNews(prisma, fixture.manager, {
      newsId: fixture.created.newsId,
      expectedVersion: approved.version,
      expectedContentHash: approved.currentRevision.contentHash,
      slug: `expiring-successor-news-${randomUUID()}`,
    });
    expect(
      (
        await getEffectivePlacement(
          prisma,
          "HOME_FEATURED_NEWS",
          EVALUATION_AFTER_REVISION_ONE_EXPIRY,
        )
      )?.news,
    ).toMatchObject({
      headline: "Expiring successor News",
      expiresAt: NEWS_REVISION_TWO_EXPIRY,
    });

    const current = await prisma.publication.findUniqueOrThrow({
      where: { id: fixture.released.publicationId },
    });
    const expiredDraft = await saveNewsRevision(prisma, fixture.contributor, {
      newsId: fixture.created.newsId,
      expectedVersion: current.version,
      headline: "Expired successor News",
      summary: "Expired successor summary",
      body: newsDocumentFromPlainText("Expired successor body"),
      expiresAt: EXPIRED_SUCCESSOR_EXPIRY,
    });
    const expiredSubmitted = await submitNews(prisma, fixture.contributor, {
      newsId: fixture.created.newsId,
      expectedVersion: expiredDraft.version,
      expectedContentHash: expiredDraft.currentRevision.contentHash,
    });
    const expiredPending = await sendNewsForApproval(prisma, fixture.editor, {
      newsId: fixture.created.newsId,
      expectedVersion: expiredSubmitted.version,
      expectedContentHash: expiredSubmitted.currentRevision.contentHash,
    });
    const expiredApproved = await approveNews(prisma, fixture.manager, {
      newsId: fixture.created.newsId,
      expectedVersion: expiredPending.version,
      expectedContentHash: expiredPending.currentRevision.contentHash,
    });
    await releaseNews(prisma, fixture.manager, {
      newsId: fixture.created.newsId,
      expectedVersion: expiredApproved.version,
      expectedContentHash: expiredApproved.currentRevision.contentHash,
      slug: `expired-successor-news-${randomUUID()}`,
    });
    expect(
      await getEffectivePlacement(
        prisma,
        "HOME_FEATURED_NEWS",
        EVALUATION_AFTER_REVISION_ONE_EXPIRY,
      ),
    ).toBeNull();
    expect(
      await prisma.contentPlacement.findUniqueOrThrow({
        where: { id: placement.id },
      }),
    ).toMatchObject({
      id: placement.id,
      publicationId: fixture.released.publicationId,
      startsAt: NEWS_START,
      endsAt: null,
      version: placement.version,
    });
    expect(
      await prisma.publicationSnapshot.count({
        where: { publicationId: fixture.released.publicationId },
      }),
    ).toBe(3);
  });
});
