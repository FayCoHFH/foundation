import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

import type { Capability } from "@/platform/auth/capabilities";
import {
  ConcurrencyError,
  PreconditionError,
} from "@/platform/errors/app-error";
import {
  assignPlacement,
  cancelFuturePlacement,
  getEffectivePlacement,
  getPlacementState,
} from "@/modules/communications/placements";
import {
  approveStory,
  createStory,
  releaseStory,
  sendStoryForApproval,
  storyDocumentFromPlainText,
  submitStory,
} from "@/modules/communications/stories";
import { assertDestructiveTestDatabaseSafety } from "../support/destructive-test-database";

const target = assertDestructiveTestDatabaseSafety();
const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("@/generated/prisma/client");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: target.databaseUrl }),
});
type Actor = { adminUserId: string; capabilities: readonly Capability[] };
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
beforeAll(async () => {
  await prisma.role.findUniqueOrThrow({
    where: { key: "communications-manager" },
  });
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
    ).toMatchObject({ endsAt: future.startsAt });
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
});
