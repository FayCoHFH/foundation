import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Capability } from "@/platform/auth/capabilities";
import {
  ConcurrencyError,
  PreconditionError,
  ValidationError,
} from "@/platform/errors/app-error";
import {
  assignPlacement,
  cancelFuturePlacement,
  getEffectivePlacement,
  getPlacementState,
  clearPlacement,
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

const WINDOW_START = new Date("2030-02-01T12:00:00.000Z");
const WINDOW_START_2 = new Date("2030-02-01T14:00:00.000Z");
const WINDOW_START_3 = new Date("2030-02-01T16:00:00.000Z");
const WINDOW_END = new Date("2030-02-01T13:00:00.000Z");
const WINDOW_END_2 = new Date("2030-02-01T15:00:00.000Z");
const WINDOW_END_3 = new Date("2030-02-01T17:00:00.000Z");
const PAST_START = new Date("2020-02-01T12:00:00.000Z");
const PAST_END = new Date("2020-02-01T13:00:00.000Z");

const SUCCESS_PLACEMENT_ACTIONS = [
  "placement.assigned",
  "placement.replaced",
  "placement.cleared",
  "placement.cancelled",
] as const;

async function successfulPlacementAuditCount() {
  return prisma.auditEvent.count({
    where: {
      targetType: "ContentPlacement",
      action: { in: [...SUCCESS_PLACEMENT_ACTIONS] },
    },
  });
}

async function expectRejectedPlacementMutation(
  action: () => Promise<unknown>,
  error:
    typeof ValidationError | typeof PreconditionError | typeof ConcurrencyError,
) {
  const rowsBefore = await prisma.contentPlacement.count();
  const auditsBefore = await successfulPlacementAuditCount();
  await expect(action()).rejects.toBeInstanceOf(error);
  expect(await prisma.contentPlacement.count()).toBe(rowsBefore);
  expect(await successfulPlacementAuditCount()).toBe(auditsBefore);
}

async function rawPlacement(
  manager: Actor,
  publicationId: string,
  key: "HOME_HERO" | "HOME_FEATURED_STORY",
  startsAt: Date,
  endsAt: Date | null,
  cancelledAt?: Date,
) {
  return prisma.contentPlacement.create({
    data: {
      key,
      publicationId,
      startsAt,
      endsAt,
      ...(cancelledAt ? { cancelledAt } : {}),
      createdByAdminUserId: manager.adminUserId,
      updatedByAdminUserId: manager.adminUserId,
    },
  });
}

async function currentPlacement() {
  const { manager, publicationId } = await releasedStory();
  const placement = await assignPlacement(prisma, manager, {
    key: "HOME_HERO",
    publicationId,
    startsAt: new Date(Date.now() - 1000),
  });
  return { manager, publicationId, placement };
}

async function placementAudit(id: string, action: string) {
  return prisma.auditEvent.findFirstOrThrow({
    where: { targetType: "ContentPlacement", targetId: id, action },
    orderBy: { occurredAt: "desc" },
  });
}

describe("C4.2A-2 placement windows and resolution", () => {
  it("1. accepts an immediate open-ended assignment", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
    });
    expect(placement.endsAt).toBeNull();
  });

  it("2. accepts an immediate bounded assignment", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      endsAt: new Date(Date.now() + 60_000),
    });
    expect(placement.endsAt).toEqual(expect.any(Date));
  });

  it("3. resolves an immediate assignment as current at startsAt", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    expect(
      (await getPlacementState(prisma, "HOME_HERO", WINDOW_START)).current?.id,
    ).toBe(placement.id);
  });

  it("4. excludes a bounded assignment at exactly endsAt", async () => {
    const { manager, publicationId } = await releasedStory();
    await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });
    const state = await getPlacementState(prisma, "HOME_HERO", WINDOW_END);
    expect(state.current).toBeNull();
    expect(
      await getEffectivePlacement(prisma, "HOME_HERO", WINDOW_END),
    ).toBeNull();
  });

  it("5. accepts a future open-ended assignment", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    expect(placement.startsAt).toEqual(WINDOW_START);
    expect(placement.endsAt).toBeNull();
  });

  it("6. accepts a future bounded assignment", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });
    expect(placement).toMatchObject({
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });
  });

  it("7. does not resolve a future assignment as current before startsAt", async () => {
    const { manager, publicationId } = await releasedStory();
    await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    expect(
      (await getPlacementState(prisma, "HOME_HERO", ASSIGNMENT_NOW)).current,
    ).toBeNull();
  });

  it("8. resolves a future assignment as upcoming before startsAt", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    expect(
      (await getPlacementState(prisma, "HOME_HERO", ASSIGNMENT_NOW)).upcoming
        ?.id,
    ).toBe(placement.id);
  });

  it("9. resolves a future assignment as current at exactly startsAt", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    expect(
      (await getPlacementState(prisma, "HOME_HERO", WINDOW_START)).current?.id,
    ).toBe(placement.id);
  });

  it("10. excludes a bounded future assignment after endsAt", async () => {
    const { manager, publicationId } = await releasedStory();
    await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });
    const state = await getPlacementState(
      prisma,
      "HOME_HERO",
      new Date("2030-02-01T13:00:00.001Z"),
    );
    expect(state.current).toBeNull();
    expect(state.upcoming).toBeNull();
  });

  it("11. rejects startsAt equal to endsAt with ValidationError", async () => {
    const { manager, publicationId } = await releasedStory();
    await expect(
      assignPlacement(prisma, manager, {
        key: "HOME_HERO",
        publicationId,
        startsAt: WINDOW_START,
        endsAt: WINDOW_START,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("12. rejects startsAt after endsAt with ValidationError", async () => {
    const { manager, publicationId } = await releasedStory();
    await expect(
      assignPlacement(prisma, manager, {
        key: "HOME_HERO",
        publicationId,
        startsAt: WINDOW_END,
        endsAt: WINDOW_START,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("13. invalid equal-window rejection persists no placement row", async () => {
    const { manager, publicationId } = await releasedStory();
    await expectRejectedPlacementMutation(
      () =>
        assignPlacement(prisma, manager, {
          key: "HOME_HERO",
          publicationId,
          startsAt: WINDOW_START,
          endsAt: WINDOW_START,
        }),
      ValidationError,
    );
  });

  it("14. invalid reverse-window rejection writes no success audit", async () => {
    const { manager, publicationId } = await releasedStory();
    await expectRejectedPlacementMutation(
      () =>
        assignPlacement(prisma, manager, {
          key: "HOME_HERO",
          publicationId,
          startsAt: WINDOW_END,
          endsAt: WINDOW_START,
        }),
      ValidationError,
    );
  });
});

describe("C4.2A-2 half-open windows and overlap", () => {
  it("15. rejects overlapping non-cancelled windows at PostgreSQL", async () => {
    const { manager, publicationId } = await releasedStory();
    await rawPlacement(
      manager,
      publicationId,
      "HOME_HERO",
      WINDOW_START,
      WINDOW_END,
    );
    await expect(
      rawPlacement(
        manager,
        publicationId,
        "HOME_HERO",
        new Date("2030-02-01T12:30:00.000Z"),
        WINDOW_END_2,
      ),
    ).rejects.toThrow(/content_placement_no_overlapping_windows/);
  });

  it("16. rejects a later overlap with an open-ended assignment at PostgreSQL", async () => {
    const { manager, publicationId } = await releasedStory();
    await rawPlacement(manager, publicationId, "HOME_HERO", WINDOW_START, null);
    await expect(
      rawPlacement(
        manager,
        publicationId,
        "HOME_HERO",
        WINDOW_START_2,
        WINDOW_END_2,
      ),
    ).rejects.toThrow(/content_placement_no_overlapping_windows/);
  });

  it("17. permits adjacent windows when the first ends at the second start", async () => {
    const { manager, publicationId } = await releasedStory();
    const first = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });
    const second = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_END,
      endsAt: WINDOW_END_2,
    });
    expect(second.id).not.toBe(first.id);
  });

  it("18. resolves adjacent half-open windows deterministically at the boundary", async () => {
    const { manager, publicationId } = await releasedStory();
    const first = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });
    const second = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_END,
      endsAt: WINDOW_END_2,
    });
    const state = await getPlacementState(prisma, "HOME_HERO", WINDOW_END);
    expect(state.current?.id).toBe(second.id);
    expect(state.current?.id).not.toBe(first.id);
  });

  it("19. permits overlapping times for different placement keys", async () => {
    const { manager, publicationId } = await releasedStory();
    const hero = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });
    const featured = await assignPlacement(prisma, manager, {
      key: "HOME_FEATURED_STORY",
      publicationId,
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });
    expect(hero.id).not.toBe(featured.id);
  });

  it("20. permits a new assignment inside a cancelled row's original window", async () => {
    const { manager, publicationId } = await releasedStory();
    const cancelled = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    await cancelFuturePlacement(
      prisma,
      manager,
      cancelled.id,
      cancelled.version,
    );
    const replacement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START_2,
      endsAt: WINDOW_END_2,
    });
    expect(replacement.id).not.toBe(cancelled.id);
  });

  it("21. excludes a cancelled row from future overlap blocking", async () => {
    const { manager, publicationId } = await releasedStory();
    const cancelled = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
      endsAt: WINDOW_END_2,
    });
    await cancelFuturePlacement(
      prisma,
      manager,
      cancelled.id,
      cancelled.version,
    );
    await expect(
      assignPlacement(prisma, manager, {
        key: "HOME_HERO",
        publicationId,
        startsAt: WINDOW_START_2,
        endsAt: WINDOW_END_3,
      }),
    ).resolves.toMatchObject({ startsAt: WINDOW_START_2 });
  });

  it("22. permits a later assignment after a historical ended row", async () => {
    const { manager, publicationId } = await releasedStory();
    await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: PAST_START,
      endsAt: PAST_END,
    });
    await expect(
      assignPlacement(prisma, manager, {
        key: "HOME_HERO",
        publicationId,
        startsAt: WINDOW_START,
        endsAt: WINDOW_END,
      }),
    ).resolves.toMatchObject({ startsAt: WINDOW_START });
  });

  it("23. preserves existing assignments after an overlap rejection", async () => {
    const { manager, publicationId } = await releasedStory();
    const first = await rawPlacement(
      manager,
      publicationId,
      "HOME_HERO",
      WINDOW_START,
      WINDOW_END,
    );
    await expect(
      rawPlacement(
        manager,
        publicationId,
        "HOME_HERO",
        new Date("2030-02-01T12:30:00.000Z"),
        WINDOW_END_2,
      ),
    ).rejects.toThrow(/content_placement_no_overlapping_windows/);
    await expect(
      prisma.contentPlacement.findUniqueOrThrow({ where: { id: first.id } }),
    ).resolves.toMatchObject({ id: first.id, endsAt: WINDOW_END });
  });

  it("24. overlap rejection writes no success audit event", async () => {
    const { manager, publicationId } = await releasedStory();
    await rawPlacement(
      manager,
      publicationId,
      "HOME_HERO",
      WINDOW_START,
      WINDOW_END,
    );
    const auditsBefore = await successfulPlacementAuditCount();
    await expect(
      rawPlacement(
        manager,
        publicationId,
        "HOME_HERO",
        new Date("2030-02-01T12:30:00.000Z"),
        WINDOW_END_2,
      ),
    ).rejects.toThrow(/content_placement_no_overlapping_windows/);
    expect(await successfulPlacementAuditCount()).toBe(auditsBefore);
  });
});

describe("C4.2A-2 current and upcoming resolution", () => {
  it("25. returns null current and upcoming when no rows exist", async () => {
    await expect(
      getPlacementState(prisma, "HOME_HERO", ASSIGNMENT_NOW),
    ).resolves.toEqual({
      current: null,
      upcoming: null,
    });
  });

  it("26. returns one active row as current", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    expect(
      (await getPlacementState(prisma, "HOME_HERO", WINDOW_START)).current?.id,
    ).toBe(placement.id);
  });

  it("27. returns one future row as upcoming", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    expect(
      (await getPlacementState(prisma, "HOME_HERO", ASSIGNMENT_NOW)).upcoming
        ?.id,
    ).toBe(placement.id);
  });

  it("28. returns current and future rows separately", async () => {
    const { manager, publicationId } = await releasedStory();
    const current = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });
    const future = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START_2,
      endsAt: WINDOW_END_2,
    });
    const state = await getPlacementState(prisma, "HOME_HERO", WINDOW_START);
    expect(state.current?.id).toBe(current.id);
    expect(state.upcoming?.id).toBe(future.id);
  });

  it("29. returns the nearest of multiple future assignments", async () => {
    const { manager, publicationId } = await releasedStory();
    const later = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START_3,
      endsAt: WINDOW_END_3,
    });
    const nearer = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START_2,
      endsAt: WINDOW_END_2,
    });
    expect(
      (await getPlacementState(prisma, "HOME_HERO", ASSIGNMENT_NOW)).upcoming
        ?.id,
    ).toBe(nearer.id);
    expect(nearer.id).not.toBe(later.id);
  });

  it("30. excludes an ended row from current resolution", async () => {
    const { manager, publicationId } = await releasedStory();
    await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: PAST_START,
      endsAt: PAST_END,
    });
    expect(
      (await getPlacementState(prisma, "HOME_HERO", ASSIGNMENT_NOW)).current,
    ).toBeNull();
  });

  it("31. excludes a cancelled future row from upcoming resolution", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    await cancelFuturePlacement(
      prisma,
      manager,
      placement.id,
      placement.version,
    );
    expect(
      (await getPlacementState(prisma, "HOME_HERO", ASSIGNMENT_NOW)).upcoming,
    ).toBeNull();
  });

  it("32. excludes a represented cancelled active-window row from current", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    await prisma.contentPlacement.update({
      where: { id: placement.id },
      data: { cancelledAt: WINDOW_START },
    });
    expect(
      (await getPlacementState(prisma, "HOME_HERO", WINDOW_START)).current,
    ).toBeNull();
  });

  it("33. ignores another placement key during current/upcoming lookup", async () => {
    const { manager, publicationId } = await releasedStory();
    await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    const state = await getPlacementState(
      prisma,
      "HOME_FEATURED_STORY",
      WINDOW_START,
    );
    expect(state).toEqual({ current: null, upcoming: null });
  });

  it("34. resolves the same persisted rows deterministically for explicit clocks", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });
    const first = await getPlacementState(prisma, "HOME_HERO", WINDOW_START);
    const second = await getPlacementState(prisma, "HOME_HERO", WINDOW_START);
    expect(first.current?.id).toBe(placement.id);
    expect(second).toEqual(first);
  });

  it("35. preserves placement identity and activation metadata", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });
    expect(
      (await getPlacementState(prisma, "HOME_HERO", WINDOW_START)).current,
    ).toMatchObject({
      id: placement.id,
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });
  });

  it("36. current/upcoming lookup excludes internal editorial relations", async () => {
    const { manager, publicationId } = await releasedStory();
    await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    const current = (await getPlacementState(prisma, "HOME_HERO", WINDOW_START))
      .current;
    expect(current).not.toBeNull();
    expect(current).not.toHaveProperty("publication.currentRevision");
    expect(current).not.toHaveProperty("publication.responsibility");
    expect(current).not.toHaveProperty("publication.transitions");
    expect(current).not.toHaveProperty("publication.approvals");
  });
});

describe("C4.2A-2 replacement and ending", () => {
  it("37. replaces the current assignment atomically", async () => {
    const { manager, publicationId } = await releasedStory();
    const first = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    const replacement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START_2,
      expectedVersion: first.version,
    });
    await expect(
      prisma.contentPlacement.findMany({
        where: { key: "HOME_HERO" },
        orderBy: { startsAt: "asc" },
      }),
    ).resolves.toHaveLength(2);
    expect(replacement.version).toBe(first.version + 1);
  });

  it("38. replacement leaves no overlapping effective rows", async () => {
    const { manager, publicationId } = await releasedStory();
    const first = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START_2,
      expectedVersion: first.version,
    });
    const rows = await prisma.contentPlacement.findMany({
      where: { key: "HOME_HERO", cancelledAt: null },
      orderBy: { startsAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.endsAt).toEqual(rows[1]?.startsAt);
  });

  it("39. replacement preserves the previous assignment as history", async () => {
    const { manager, publicationId } = await releasedStory();
    const first = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START_2,
      expectedVersion: first.version,
    });
    await expect(
      prisma.contentPlacement.findUniqueOrThrow({ where: { id: first.id } }),
    ).resolves.toMatchObject({
      id: first.id,
      startsAt: WINDOW_START,
      endsAt: WINDOW_START_2,
    });
  });

  it("40. replacement makes the new assignment current at its instant", async () => {
    const { manager, publicationId } = await releasedStory();
    const first = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    const replacement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START_2,
      expectedVersion: first.version,
    });
    expect(
      (await getPlacementState(prisma, "HOME_HERO", WINDOW_START_2)).current
        ?.id,
    ).toBe(replacement.id);
  });

  it("41. clearing the current assignment preserves its row", async () => {
    const { manager, placement } = await currentPlacement();
    await clearPlacement(prisma, manager, "HOME_HERO", placement.version);
    await expect(
      prisma.contentPlacement.findUniqueOrThrow({
        where: { id: placement.id },
      }),
    ).resolves.toMatchObject({ id: placement.id, endsAt: expect.any(Date) });
  });

  it("42. clearing the current assignment removes it from resolution", async () => {
    const { manager, placement } = await currentPlacement();
    await clearPlacement(prisma, manager, "HOME_HERO", placement.version);
    expect(
      await getEffectivePlacement(prisma, "HOME_HERO", new Date()),
    ).toBeNull();
  });

  it("43. clearing an already-ended assignment is idempotent", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: PAST_START,
      endsAt: PAST_END,
    });
    await expect(
      clearPlacement(prisma, manager, "HOME_HERO", placement.version),
    ).resolves.toBeUndefined();
    await expect(
      prisma.contentPlacement.findUniqueOrThrow({
        where: { id: placement.id },
      }),
    ).resolves.toMatchObject({ id: placement.id, endsAt: PAST_END });
  });

  it("44. clearing with no current assignment is a no-op", async () => {
    const manager = await actor("communications-manager");
    await expect(
      clearPlacement(prisma, manager, "HOME_HERO"),
    ).resolves.toBeUndefined();
  });

  it("45. replacement and clearing produce distinct audit events", async () => {
    const { manager, placement } = await currentPlacement();
    const replacement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId: placement.publicationId,
      startsAt: new Date(placement.startsAt.getTime() + 1000),
      expectedVersion: placement.version,
    });
    await clearPlacement(prisma, manager, "HOME_HERO", replacement.version);
    await expect(
      placementAudit(replacement.id, "placement.replaced"),
    ).resolves.toMatchObject({
      targetId: replacement.id,
    });
    await expect(
      placementAudit(replacement.id, "placement.cleared"),
    ).resolves.toMatchObject({
      targetId: replacement.id,
    });
  });
});

describe("C4.2A-2 future cancellation", () => {
  it("46. records cancelledAt for a future assignment", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    await cancelFuturePlacement(
      prisma,
      manager,
      placement.id,
      placement.version,
    );
    await expect(
      prisma.contentPlacement.findUniqueOrThrow({
        where: { id: placement.id },
      }),
    ).resolves.toMatchObject({ cancelledAt: expect.any(Date) });
  });

  it("47. cancellation preserves the original startsAt", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    await cancelFuturePlacement(
      prisma,
      manager,
      placement.id,
      placement.version,
    );
    await expect(
      prisma.contentPlacement.findUniqueOrThrow({
        where: { id: placement.id },
      }),
    ).resolves.toMatchObject({ startsAt: WINDOW_START });
  });

  it("48. cancellation preserves the original endsAt including null", async () => {
    const { manager, publicationId } = await releasedStory();
    const open = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    await cancelFuturePlacement(prisma, manager, open.id, open.version);
    await expect(
      prisma.contentPlacement.findUniqueOrThrow({ where: { id: open.id } }),
    ).resolves.toMatchObject({ endsAt: null });
  });

  it("49. cancellation preserves the ContentPlacement row", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });
    await cancelFuturePlacement(
      prisma,
      manager,
      placement.id,
      placement.version,
    );
    expect(
      await prisma.contentPlacement.findUnique({ where: { id: placement.id } }),
    ).not.toBeNull();
  });

  it("50. cancelled assignment disappears from upcoming resolution", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    await cancelFuturePlacement(
      prisma,
      manager,
      placement.id,
      placement.version,
    );
    expect(
      (await getPlacementState(prisma, "HOME_HERO", ASSIGNMENT_NOW)).upcoming,
    ).toBeNull();
  });

  it("51. cancelled assignment never becomes current after its original start", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    await cancelFuturePlacement(
      prisma,
      manager,
      placement.id,
      placement.version,
    );
    expect(
      (await getPlacementState(prisma, "HOME_HERO", WINDOW_START)).current,
    ).toBeNull();
  });

  it("52. cancelled assignment does not block a replacement future schedule", async () => {
    const { manager, publicationId } = await releasedStory();
    const cancelled = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    await cancelFuturePlacement(
      prisma,
      manager,
      cancelled.id,
      cancelled.version,
    );
    await expect(
      assignPlacement(prisma, manager, {
        key: "HOME_HERO",
        publicationId,
        startsAt: WINDOW_START_2,
      }),
    ).resolves.toMatchObject({ startsAt: WINDOW_START_2 });
  });

  it("53. rejects cancellation of an already-active assignment", async () => {
    const { manager, placement } = await currentPlacement();
    await expectRejectedPlacementMutation(
      () =>
        cancelFuturePlacement(prisma, manager, placement.id, placement.version),
      PreconditionError,
    );
  });

  it("54. rejects cancellation of an already-ended assignment", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: PAST_START,
      endsAt: PAST_END,
    });
    await expectRejectedPlacementMutation(
      () =>
        cancelFuturePlacement(prisma, manager, placement.id, placement.version),
      PreconditionError,
    );
  });

  it("55. rejects cancellation of an already-cancelled assignment", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    await cancelFuturePlacement(
      prisma,
      manager,
      placement.id,
      placement.version,
    );
    await expectRejectedPlacementMutation(
      () =>
        cancelFuturePlacement(
          prisma,
          manager,
          placement.id,
          placement.version + 1,
        ),
      PreconditionError,
    );
  });

  it("56. failed cancellation leaves the original state unchanged", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    await expect(
      cancelFuturePlacement(
        prisma,
        manager,
        placement.id,
        placement.version + 1,
      ),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(
      prisma.contentPlacement.findUniqueOrThrow({
        where: { id: placement.id },
      }),
    ).resolves.toMatchObject({
      id: placement.id,
      startsAt: WINDOW_START,
      endsAt: null,
      cancelledAt: null,
      version: placement.version,
    });
  });

  it("57. cancellation audit metadata preserves the intended activation window", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });
    await cancelFuturePlacement(
      prisma,
      manager,
      placement.id,
      placement.version,
    );
    const event = await placementAudit(placement.id, "placement.cancelled");
    const summary = event.summary as Record<string, unknown>;
    expect(event.actorAdminUserId).toBe(manager.adminUserId);
    expect(event.correlationId).toEqual(expect.any(String));
    expect(summary).toMatchObject({
      placement: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START.toISOString(),
      endsAt: WINDOW_END.toISOString(),
      cancelledAt: expect.any(String),
    });
  });
});

describe("C4.2A-2 optimistic concurrency", () => {
  it("58-62. rejects a stale replacement and preserves current and history", async () => {
    const { manager: adminA, publicationId } = await releasedStory();
    const adminB = await actor("communications-manager");
    const first = await assignPlacement(prisma, adminA, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    const versionReadByA = first.version;
    const changedByB = await assignPlacement(prisma, adminB, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START_2,
      expectedVersion: first.version,
    });
    await expect(
      assignPlacement(prisma, adminA, {
        key: "HOME_HERO",
        publicationId,
        startsAt: WINDOW_START_2,
        expectedVersion: versionReadByA,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(
      prisma.contentPlacement.findMany({
        where: { key: "HOME_HERO" },
        orderBy: { startsAt: "asc" },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.id, endsAt: WINDOW_START_2 }),
        expect.objectContaining({ id: changedByB.id, endsAt: null }),
      ]),
    );
  });

  it("63-67. rejects a stale clear and preserves the ended state", async () => {
    const { manager: adminA, placement } = await currentPlacement();
    const adminB = await actor("communications-manager");
    await clearPlacement(prisma, adminB, "HOME_HERO", placement.version);
    await expect(
      clearPlacement(prisma, adminA, "HOME_HERO", placement.version),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(
      prisma.contentPlacement.findUniqueOrThrow({
        where: { id: placement.id },
      }),
    ).resolves.toMatchObject({
      id: placement.id,
      version: placement.version + 1,
    });
  });

  it("68-72. rejects stale future cancellation and preserves cancellation state", async () => {
    const { manager: adminA, publicationId } = await releasedStory();
    const adminB = await actor("communications-manager");
    const placement = await assignPlacement(prisma, adminA, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    await cancelFuturePlacement(
      prisma,
      adminB,
      placement.id,
      placement.version,
    );
    await expect(
      cancelFuturePlacement(prisma, adminA, placement.id, placement.version),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(
      prisma.contentPlacement.findUniqueOrThrow({
        where: { id: placement.id },
      }),
    ).resolves.toMatchObject({
      id: placement.id,
      version: placement.version + 1,
      cancelledAt: expect.any(Date),
    });
  });

  it("73-75. successful mutations progress the persisted token at the service boundary", async () => {
    const { manager, placement: first } = await currentPlacement();
    const second = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId: first.publicationId,
      startsAt: new Date(first.startsAt.getTime() + 1),
      expectedVersion: first.version,
    });
    expect(second.version).toBe(first.version + 1);
    await expect(
      clearPlacement(prisma, manager, "HOME_HERO", second.version),
    ).resolves.toBeUndefined();
    await expect(
      prisma.contentPlacement.findUniqueOrThrow({ where: { id: second.id } }),
    ).resolves.toMatchObject({ version: second.version + 1 });
  });
});

describe("C4.2A-2 audit evidence", () => {
  it("76. audits immediate assignment with bounded placement metadata", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });
    const event = await placementAudit(placement.id, "placement.assigned");
    const summary = event.summary as Record<string, unknown>;
    expect(event).toMatchObject({
      actorAdminUserId: manager.adminUserId,
      targetId: placement.id,
      correlationId: expect.any(String),
    });
    expect(summary).toMatchObject({
      placement: "HOME_HERO",
      publicationId,
      kind: "STORY",
      startsAt: WINDOW_START.toISOString(),
      endsAt: WINDOW_END.toISOString(),
    });
    expect(JSON.stringify(summary)).not.toMatch(
      /Public body|structured|owner|approval/,
    );
  });

  it("77. audits future scheduling with its intended window", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    const event = await placementAudit(placement.id, "placement.assigned");
    expect(event.summary).toMatchObject({
      placement: "HOME_HERO",
      startsAt: WINDOW_START.toISOString(),
      endsAt: null,
    });
  });

  it("78. audits replacement with the prior placement identity and window", async () => {
    const { manager, publicationId } = await releasedStory();
    const first = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    const replacement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START_2,
      expectedVersion: first.version,
    });
    expect(
      await placementAudit(replacement.id, "placement.replaced"),
    ).toMatchObject({
      actorAdminUserId: manager.adminUserId,
      targetId: replacement.id,
      summary: expect.objectContaining({
        previousPlacementId: first.id,
        previousStartsAt: WINDOW_START.toISOString(),
        previousEndsAt: null,
      }),
    });
  });

  it("79. audits end/clear with the original activation metadata", async () => {
    const { manager, placement } = await currentPlacement();
    await clearPlacement(prisma, manager, "HOME_HERO", placement.version);
    const event = await placementAudit(placement.id, "placement.cleared");
    expect(event).toMatchObject({
      actorAdminUserId: manager.adminUserId,
      targetId: placement.id,
      correlationId: expect.any(String),
      summary: expect.objectContaining({
        placement: "HOME_HERO",
        publicationId: placement.publicationId,
        startsAt: placement.startsAt.toISOString(),
        endsAt: null,
        endedAt: expect.any(String),
      }),
    });
  });

  it("80. audits future cancellation with actor and correlation metadata", async () => {
    const { manager, publicationId } = await releasedStory();
    const placement = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    await cancelFuturePlacement(
      prisma,
      manager,
      placement.id,
      placement.version,
    );
    const event = await placementAudit(placement.id, "placement.cancelled");
    expect(event).toMatchObject({
      actorAdminUserId: manager.adminUserId,
      targetId: placement.id,
      correlationId: expect.any(String),
      summary: expect.objectContaining({
        placement: "HOME_HERO",
        publicationId,
        startsAt: WINDOW_START.toISOString(),
        endsAt: null,
        cancelledAt: expect.any(String),
      }),
    });
  });

  it("81. invalid target or window writes no success audit event", async () => {
    const { manager, publicationId } = await releasedStory();
    const before = await successfulPlacementAuditCount();
    await expect(
      assignPlacement(prisma, manager, {
        key: "HOME_HERO",
        publicationId,
        startsAt: WINDOW_START,
        endsAt: WINDOW_START,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await successfulPlacementAuditCount()).toBe(before);
  });

  it("82. overlap rejection writes no success audit event", async () => {
    const { manager, publicationId } = await releasedStory();
    await rawPlacement(
      manager,
      publicationId,
      "HOME_HERO",
      WINDOW_START,
      WINDOW_END,
    );
    const before = await successfulPlacementAuditCount();
    await expect(
      rawPlacement(
        manager,
        publicationId,
        "HOME_HERO",
        new Date("2030-02-01T12:30:00.000Z"),
        WINDOW_END_2,
      ),
    ).rejects.toThrow(/content_placement_no_overlapping_windows/);
    expect(await successfulPlacementAuditCount()).toBe(before);
  });

  it("83. stale version rejection writes no success audit event", async () => {
    const { manager, publicationId } = await releasedStory();
    const first = await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START,
    });
    await assignPlacement(prisma, manager, {
      key: "HOME_HERO",
      publicationId,
      startsAt: WINDOW_START_2,
      expectedVersion: first.version,
    });
    const before = await successfulPlacementAuditCount();
    await expect(
      assignPlacement(prisma, manager, {
        key: "HOME_HERO",
        publicationId,
        startsAt: WINDOW_START_2,
        expectedVersion: first.version,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    expect(await successfulPlacementAuditCount()).toBe(before);
  });

  it("84. invalid cancellation writes no success audit event", async () => {
    const { manager, placement } = await currentPlacement();
    const before = await successfulPlacementAuditCount();
    await expect(
      cancelFuturePlacement(prisma, manager, placement.id, placement.version),
    ).rejects.toBeInstanceOf(PreconditionError);
    expect(await successfulPlacementAuditCount()).toBe(before);
  });
});
