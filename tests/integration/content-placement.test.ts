import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Capability } from "@/platform/auth/capabilities";
import {
  ConcurrencyError,
  PreconditionError,
} from "@/platform/errors/app-error";
import {
  assignPlacement,
  getEffectivePlacement,
  getPlacementState,
  cancelFuturePlacement,
} from "@/modules/communications/placements";
import {
  approveNews,
  archiveNews,
  createNews,
  newsDocumentFromPlainText,
  releaseNews,
  sendNewsForApproval,
  submitNews,
  withdrawNews,
} from "@/modules/communications/news";
import {
  approveStory,
  archiveStory,
  createStory,
  releaseStory,
  sendStoryForApproval,
  storyDocumentFromPlainText,
  submitStory,
  withdrawStory,
} from "@/modules/communications/stories";
import { assertDestructiveTestDatabaseSafety } from "../support/destructive-test-database";

const target = assertDestructiveTestDatabaseSafety();
const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("@/generated/prisma/client");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: target.databaseUrl }),
});
type Actor = { adminUserId: string; capabilities: readonly Capability[] };
const ASSIGNMENT_NOW = new Date("2030-01-01T12:00:00.000Z");
const ASSIGNMENT_AFTER_LATER = new Date("2030-01-03T12:00:00.000Z");

async function actor(roleKey: string): Promise<Actor> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  const suffix = randomUUID(),
    id = `c4-${suffix}`;
  await prisma.user.create({
    data: {
      id,
      name: "C4",
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
async function releasedStory() {
  const contributor = await actor("contributor"),
    editor = await actor("editor"),
    manager = await actor("communications-manager");
  const created = await createStory(prisma, contributor, {
    headline: "Placed Story",
    deck: "Deck",
    excerpt: "Excerpt",
    body: storyDocumentFromPlainText("Public body"),
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
    slug: `placed-${randomUUID()}`,
  });
  return { manager, publicationId: released.publicationId };
}

async function unreleasedStory() {
  const contributor = await actor("contributor");
  const manager = await actor("communications-manager");
  const created = await createStory(prisma, contributor, {
    headline: "Unreleased Story",
    deck: "Deck",
    excerpt: "Excerpt",
    body: storyDocumentFromPlainText("Private body"),
  });
  return { manager, publicationId: created.publicationId };
}

async function withdrawnStory() {
  const contributor = await actor("contributor"),
    editor = await actor("editor"),
    manager = await actor("communications-manager");
  const created = await createStory(prisma, contributor, {
    headline: "Withdrawn Story",
    deck: "Deck",
    excerpt: "Excerpt",
    body: storyDocumentFromPlainText("Public body"),
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
    slug: `withdrawn-${randomUUID()}`,
  });
  const withdrawn = await withdrawStory(prisma, manager, {
    storyId: created.storyId,
    expectedVersion: released.version,
    reason: "Placement eligibility test withdrawal.",
  });
  return {
    manager,
    publicationId: withdrawn.publicationId,
  };
}

async function archivedStory() {
  const released = await releasedStory();
  const archived = await archiveStory(prisma, released.manager, {
    storyId: (
      await prisma.story.findUniqueOrThrow({
        where: { publicationId: released.publicationId },
      })
    ).id,
    expectedVersion: (
      await prisma.publication.findUniqueOrThrow({
        where: { id: released.publicationId },
      })
    ).version,
  });
  return { manager: released.manager, publicationId: archived.publicationId };
}

async function releasedNews(expiresAt: Date | null = null) {
  const contributor = await actor("contributor"),
    editor = await actor("editor"),
    manager = await actor("communications-manager");
  const created = await createNews(prisma, contributor, {
    headline: "Placed News",
    summary: "Summary",
    body: newsDocumentFromPlainText("Public News body"),
    expiresAt,
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
    slug: `placed-news-${randomUUID()}`,
  });
  return {
    manager,
    publicationId: released.publicationId,
    newsId: released.newsId,
  };
}

async function unreleasedNews() {
  const contributor = await actor("contributor");
  const manager = await actor("communications-manager");
  const created = await createNews(prisma, contributor, {
    headline: "Unreleased News",
    summary: "Summary",
    body: newsDocumentFromPlainText("Private News body"),
    expiresAt: null,
  });
  return { manager, publicationId: created.publicationId };
}

async function withdrawnNews() {
  const released = await releasedNews();
  const publication = await prisma.publication.findUniqueOrThrow({
    where: { id: released.publicationId },
  });
  await withdrawNews(prisma, released.manager, {
    newsId: released.newsId,
    expectedVersion: publication.version,
    reason: "Placement eligibility test withdrawal.",
  });
  return released;
}

async function archivedNews() {
  const released = await releasedNews();
  const publication = await prisma.publication.findUniqueOrThrow({
    where: { id: released.publicationId },
  });
  await archiveNews(prisma, released.manager, {
    newsId: released.newsId,
    expectedVersion: publication.version,
  });
  return released;
}

async function expectRejectedAssignment(
  manager: Actor,
  input: Parameters<typeof assignPlacement>[2],
) {
  const placementsBefore = await prisma.contentPlacement.count();
  const successesBefore = await prisma.auditEvent.count({
    where: {
      targetType: "ContentPlacement",
      action: { in: ["placement.assigned", "placement.replaced"] },
    },
  });
  await expect(assignPlacement(prisma, manager, input)).rejects.toBeInstanceOf(
    PreconditionError,
  );
  expect(await prisma.contentPlacement.count()).toBe(placementsBefore);
  expect(
    await prisma.auditEvent.count({
      where: {
        targetType: "ContentPlacement",
        action: { in: ["placement.assigned", "placement.replaced"] },
      },
    }),
  ).toBe(successesBefore);
}

beforeAll(async () => {
  await prisma.role.findUniqueOrThrow({
    where: { key: "communications-manager" },
  });
});
beforeEach(async () => {
  await prisma.contentPlacement.deleteMany();
});
afterAll(async () => {
  await prisma.contentPlacement.deleteMany();
});
describe("C4 content placements", () => {
  it("assigns, schedules, resolves, rejects stale writes, and retains cancelled history", async () => {
    const { manager, publicationId } = await releasedStory();
    const now = new Date("2030-01-01T12:00:00.000Z");
    const active = await assignPlacement(prisma, manager, {
      key: "HOME_FEATURED_STORY",
      publicationId,
      startsAt: now,
    });
    expect(
      (await getEffectivePlacement(prisma, "HOME_FEATURED_STORY", now))?.story
        ?.headline,
    ).toBe("Placed Story");
    const future = await assignPlacement(prisma, manager, {
      key: "HOME_FEATURED_STORY",
      publicationId,
      startsAt: new Date("2030-01-02T12:00:00.000Z"),
    });
    const state = await getPlacementState(prisma, "HOME_FEATURED_STORY", now);
    expect(state.current?.id).toBe(active.id);
    expect(state.upcoming?.id).toBe(future.id);
    await expect(
      assignPlacement(prisma, manager, {
        key: "HOME_FEATURED_STORY",
        publicationId,
        startsAt: now,
        expectedVersion: 999,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    await cancelFuturePlacement(prisma, manager, future.id, future.version);
    expect(
      await prisma.contentPlacement.findUnique({ where: { id: future.id } }),
    ).toMatchObject({
      startsAt: future.startsAt,
      endsAt: null,
      cancelledAt: expect.any(Date),
    });
    expect(
      (await getPlacementState(prisma, "HOME_FEATURED_STORY", now)).upcoming,
    ).toBeNull();
    expect(
      await prisma.auditEvent.count({
        where: { targetType: "ContentPlacement" },
      }),
    ).toBeGreaterThan(1);
  });
  it("rejects illegal target kinds and invalid windows", async () => {
    const { manager, publicationId } = await releasedStory();
    await expect(
      assignPlacement(prisma, manager, {
        key: "HOME_FEATURED_NEWS",
        publicationId,
      }),
    ).rejects.toBeInstanceOf(PreconditionError);
    await expect(
      assignPlacement(prisma, manager, {
        key: "HOME_HERO",
        publicationId,
        startsAt: new Date("2031-01-01T00:00:00Z"),
        endsAt: new Date("2031-01-01T00:00:00Z"),
      }),
    ).rejects.toThrow(/precede/);
  });

  it("accepts an eligible released Story in HOME_FEATURED_STORY", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_FEATURED_STORY",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
    expect(placement.publicationId).toBe(publicationId);
  });

  it("rejects an eligible released News item in HOME_FEATURED_STORY", async () => {
    const { manager, publicationId } = await releasedNews();
    await expectRejectedAssignment(manager, {
      key: "HOME_FEATURED_STORY",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
  });

  it("accepts an eligible released News item in HOME_FEATURED_NEWS", async () => {
    const { manager, publicationId } = await releasedNews();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_FEATURED_NEWS",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
    expect(placement.publicationId).toBe(publicationId);
  });

  it("rejects an eligible released Story in HOME_FEATURED_NEWS", async () => {
    const { manager, publicationId } = await releasedStory();
    await expectRejectedAssignment(manager, {
      key: "HOME_FEATURED_NEWS",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
  });

  it("accepts an eligible released Story in HOME_HERO", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
    expect(placement.publicationId).toBe(publicationId);
  });

  it("accepts an eligible released News item in HOME_HERO", async () => {
    const { manager, publicationId } = await releasedNews();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
    expect(placement.publicationId).toBe(publicationId);
  });

  it("accepts an eligible released News item in NEWS_FEATURED", async () => {
    const { manager, publicationId } = await releasedNews();
    const placement = await assignPlacement(prisma, manager, {
      key: "NEWS_FEATURED",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
    expect(placement.publicationId).toBe(publicationId);
  });

  it("rejects an eligible released Story in NEWS_FEATURED", async () => {
    const { manager, publicationId } = await releasedStory();
    await expectRejectedAssignment(manager, {
      key: "NEWS_FEATURED",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
  });

  it("rejects an unreleased Story as a placement target", async () => {
    const { manager, publicationId } = await unreleasedStory();
    await expectRejectedAssignment(manager, {
      key: "HOME_FEATURED_STORY",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
  });

  it("rejects an unreleased News item as a placement target", async () => {
    const { manager, publicationId } = await unreleasedNews();
    await expectRejectedAssignment(manager, {
      key: "HOME_FEATURED_NEWS",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
  });

  it("rejects a withdrawn Story as a new placement target", async () => {
    const { manager, publicationId } = await withdrawnStory();
    await expectRejectedAssignment(manager, {
      key: "HOME_FEATURED_STORY",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
  });

  it("rejects a withdrawn News item as a new placement target", async () => {
    const { manager, publicationId } = await withdrawnNews();
    await expectRejectedAssignment(manager, {
      key: "HOME_FEATURED_NEWS",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
  });

  it("rejects an archived Story as a new placement target", async () => {
    const { manager, publicationId } = await archivedStory();
    await expectRejectedAssignment(manager, {
      key: "HOME_FEATURED_STORY",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
  });

  it("rejects an archived News item as a new placement target", async () => {
    const { manager, publicationId } = await archivedNews();
    await expectRejectedAssignment(manager, {
      key: "HOME_FEATURED_NEWS",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
  });

  it("rejects an expired News item as a new placement target", async () => {
    const { manager, publicationId } = await releasedNews(
      new Date("2029-12-31T23:59:59.000Z"),
    );
    await expectRejectedAssignment(manager, {
      key: "HOME_FEATURED_NEWS",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
  });

  it("keeps an expired News placement row while making it ineffective", async () => {
    const { manager, publicationId } = await releasedNews(
      new Date("2030-01-02T00:00:00.000Z"),
    );
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_FEATURED_NEWS",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
    expect(
      await getEffectivePlacement(
        prisma,
        "HOME_FEATURED_NEWS",
        ASSIGNMENT_AFTER_LATER,
      ),
    ).toBeNull();
    expect(
      await prisma.contentPlacement.findUnique({ where: { id: placement.id } }),
    ).toMatchObject({ id: placement.id, publicationId });
  });

  it("keeps a withdrawn Story placement row while making it ineffective", async () => {
    const { manager, publicationId } = await releasedStory();
    const story = await prisma.story.findUniqueOrThrow({
      where: { publicationId },
    });
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_FEATURED_STORY",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
    const publication = await prisma.publication.findUniqueOrThrow({
      where: { id: publicationId },
    });
    await withdrawStory(prisma, manager, {
      storyId: story.id,
      expectedVersion: publication.version,
      reason: "Post-assignment eligibility test withdrawal.",
    });
    expect(
      await getEffectivePlacement(
        prisma,
        "HOME_FEATURED_STORY",
        ASSIGNMENT_NOW,
      ),
    ).toBeNull();
    expect(
      await prisma.contentPlacement.findUnique({ where: { id: placement.id } }),
    ).not.toBeNull();
  });

  it("keeps a withdrawn News placement row while making it ineffective", async () => {
    const { manager, publicationId, newsId } = await releasedNews();
    const placement = await assignPlacement(prisma, manager, {
      key: "NEWS_FEATURED",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
    const publication = await prisma.publication.findUniqueOrThrow({
      where: { id: publicationId },
    });
    await withdrawNews(prisma, manager, {
      newsId,
      expectedVersion: publication.version,
      reason: "Post-assignment eligibility test withdrawal.",
    });
    expect(
      await getEffectivePlacement(prisma, "NEWS_FEATURED", ASSIGNMENT_NOW),
    ).toBeNull();
    expect(
      await prisma.contentPlacement.findUnique({ where: { id: placement.id } }),
    ).not.toBeNull();
  });

  it("keeps an archived News placement row while making it ineffective", async () => {
    const { manager, publicationId, newsId } = await releasedNews();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_FEATURED_NEWS",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
    const publication = await prisma.publication.findUniqueOrThrow({
      where: { id: publicationId },
    });
    await archiveNews(prisma, manager, {
      newsId,
      expectedVersion: publication.version,
    });
    expect(
      await getEffectivePlacement(prisma, "HOME_FEATURED_NEWS", ASSIGNMENT_NOW),
    ).toBeNull();
    expect(
      await prisma.contentPlacement.findUnique({ where: { id: placement.id } }),
    ).not.toBeNull();
  });

  it("returns no effective public target for an ineligible assigned publication", async () => {
    const { manager, publicationId } = await releasedStory();
    await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
    const story = await prisma.story.findUniqueOrThrow({
      where: { publicationId },
    });
    const publication = await prisma.publication.findUniqueOrThrow({
      where: { id: publicationId },
    });
    await withdrawStory(prisma, manager, {
      storyId: story.id,
      expectedVersion: publication.version,
      reason: "Resolver ineligibility test withdrawal.",
    });
    expect(
      await getEffectivePlacement(prisma, "HOME_HERO", ASSIGNMENT_NOW),
    ).toBeNull();
  });

  it("keeps historical placement data queryable after target ineligibility", async () => {
    const { manager, publicationId } = await releasedNews();
    const placement = await assignPlacement(prisma, manager, {
      key: "NEWS_FEATURED",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
    const publication = await prisma.publication.findUniqueOrThrow({
      where: { id: publicationId },
    });
    await archiveNews(prisma, manager, {
      newsId: (
        await prisma.newsItem.findUniqueOrThrow({
          where: { publicationId },
        })
      ).id,
      expectedVersion: publication.version,
    });
    await expect(
      prisma.contentPlacement.findUniqueOrThrow({
        where: { id: placement.id },
      }),
    ).resolves.toMatchObject({
      id: placement.id,
      key: "NEWS_FEATURED",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
  });

  it("resolves a released current discovery-eligible Story normally", async () => {
    const { manager, publicationId } = await releasedStory();
    await assignPlacement(prisma, manager, {
      key: "HOME_FEATURED_STORY",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
    const resolved = await getEffectivePlacement(
      prisma,
      "HOME_FEATURED_STORY",
      ASSIGNMENT_NOW,
    );
    expect(resolved?.story?.headline).toBe("Placed Story");
    expect(resolved?.news).toBeNull();
  });

  it("resolves Story through a public projection DTO only", async () => {
    const { manager, publicationId } = await releasedStory();
    await assignPlacement(prisma, manager, {
      key: "HOME_FEATURED_STORY",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
    const resolved = await getEffectivePlacement(
      prisma,
      "HOME_FEATURED_STORY",
      ASSIGNMENT_NOW,
    );
    expect(resolved).not.toBeNull();
    expect(Object.keys(resolved!.placement)).toEqual([
      "id",
      "key",
      "publicationId",
      "startsAt",
      "endsAt",
    ]);
    expect(Object.keys(resolved!.story!)).toEqual([
      "slug",
      "headline",
      "deck",
      "excerpt",
      "body",
      "publishedAt",
    ]);
    expect(resolved).not.toHaveProperty("publication");
    expect(resolved!.placement).not.toHaveProperty("createdByAdminUserId");
    expect(resolved!.placement).not.toHaveProperty("updatedByAdminUserId");
    expect(resolved!.story).not.toHaveProperty("currentRevision");
    expect(resolved!.story).not.toHaveProperty("responsibility");
    expect(resolved!.story).not.toHaveProperty("transitions");
    expect(resolved!.story).not.toHaveProperty("approvals");
    expect(resolved!.story).not.toHaveProperty("auditEvent");
  });

  it("resolves News through a public projection DTO only", async () => {
    const { manager, publicationId } = await releasedNews();
    await assignPlacement(prisma, manager, {
      key: "NEWS_FEATURED",
      publicationId,
      startsAt: ASSIGNMENT_NOW,
    });
    const resolved = await getEffectivePlacement(
      prisma,
      "NEWS_FEATURED",
      ASSIGNMENT_NOW,
    );
    expect(Object.keys(resolved!.news!)).toEqual([
      "slug",
      "headline",
      "summary",
      "body",
      "publishedAt",
      "expiresAt",
    ]);
    expect(resolved!.story).toBeNull();
    expect(resolved!.news).not.toHaveProperty("currentRevision");
    expect(resolved!.news).not.toHaveProperty("responsibility");
    expect(resolved!.news).not.toHaveProperty("transitions");
    expect(resolved!.news).not.toHaveProperty("approvals");
    expect(resolved!.news).not.toHaveProperty("auditEvent");
  });
});
