import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Capability } from "@/platform/auth/capabilities";
import {
  assignPlacement,
  cancelFuturePlacement,
  clearPlacement,
  getEffectivePlacement,
  getPlacementState,
  type PlacementMutationDependencies,
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
const IMMEDIATE_START = new Date("2030-01-01T12:00:00.000Z");
const BOUNDED_END = new Date("2030-01-01T13:00:00.000Z");
const FUTURE_START = new Date("2030-02-01T12:00:00.000Z");
const REPLACEMENT_START = new Date("2030-01-02T12:00:00.000Z");
const REPLACEMENT_END = new Date("2030-01-03T12:00:00.000Z");
const SUCCESS_ACTIONS = [
  "placement.assigned",
  "placement.replaced",
  "placement.cleared",
  "placement.cancelled",
] as const;

class InjectedAuditFailure extends Error {
  constructor() {
    super("Injected placement audit persistence failure.");
    this.name = "InjectedAuditFailure";
  }
}

const failAuditPersistence: PlacementMutationDependencies = {
  auditWriter: async () => {
    throw new InjectedAuditFailure();
  },
};

async function actor(roleKey: string): Promise<Actor> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  const id = `c4-2a-3b-${randomUUID()}`;
  await prisma.user.create({
    data: {
      id,
      name: "C4.2A-3B",
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
  const contributor = await actor("contributor");
  const editor = await actor("editor");
  const manager = await actor("communications-manager");
  const created = await createStory(prisma, contributor, {
    headline: "Rollback Story",
    deck: "Rollback deck",
    excerpt: "Rollback excerpt",
    body: storyDocumentFromPlainText("Rollback public body"),
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
    slug: `rollback-story-${randomUUID()}`,
  });
  return { manager, publicationId: released.publicationId };
}

async function placementRow(id: string) {
  return prisma.$transaction((tx) =>
    tx.contentPlacement.findUnique({ where: { id } }),
  );
}

async function placementRows() {
  return prisma.$transaction((tx) =>
    tx.contentPlacement.findMany({ orderBy: { createdAt: "asc" } }),
  );
}

async function successfulPlacementAuditCount() {
  return prisma.$transaction((tx) =>
    tx.auditEvent.count({
      where: {
        targetType: "ContentPlacement",
        action: { in: [...SUCCESS_ACTIONS] },
      },
    }),
  );
}

async function placementAuditCount(action: (typeof SUCCESS_ACTIONS)[number]) {
  return prisma.$transaction((tx) =>
    tx.auditEvent.count({
      where: { targetType: "ContentPlacement", action },
    }),
  );
}

async function expectRollback(beforeAudits: number) {
  expect(await placementRows()).toHaveLength(0);
  expect(await successfulPlacementAuditCount()).toBe(beforeAudits);
}

beforeAll(async () => {
  await prisma.role.findUniqueOrThrow({ where: { key: "contributor" } });
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

describe("C4.2A-3B placement transaction rollback", () => {
  describe("assignment and scheduling", () => {
    it("rolls back an immediate open-ended assignment when audit persistence fails", async () => {
      const { manager, publicationId } = await releasedStory();
      const auditsBefore = await successfulPlacementAuditCount();

      await expect(
        assignPlacement(
          prisma,
          manager,
          {
            key: "HOME_HERO",
            publicationId,
            startsAt: IMMEDIATE_START,
          },
          failAuditPersistence,
        ),
      ).rejects.toBeInstanceOf(InjectedAuditFailure);

      await expectRollback(auditsBefore);
      expect(
        await getEffectivePlacement(prisma, "HOME_HERO", IMMEDIATE_START),
      ).toBeNull();
    });

    it("rolls back a bounded immediate assignment without consuming a row or audit", async () => {
      const { manager, publicationId } = await releasedStory();
      const auditsBefore = await successfulPlacementAuditCount();

      await expect(
        assignPlacement(
          prisma,
          manager,
          {
            key: "HOME_HERO",
            publicationId,
            startsAt: IMMEDIATE_START,
            endsAt: BOUNDED_END,
          },
          failAuditPersistence,
        ),
      ).rejects.toBeInstanceOf(InjectedAuditFailure);

      await expectRollback(auditsBefore);
      expect(
        (await getPlacementState(prisma, "HOME_HERO", IMMEDIATE_START)).current,
      ).toBeNull();
      expect(
        (await getPlacementState(prisma, "HOME_HERO", IMMEDIATE_START))
          .upcoming,
      ).toBeNull();
    });

    it("rolls back a future scheduled assignment with no upcoming or historical artifact", async () => {
      const { manager, publicationId } = await releasedStory();
      const auditsBefore = await successfulPlacementAuditCount();

      await expect(
        assignPlacement(
          prisma,
          manager,
          {
            key: "HOME_HERO",
            publicationId,
            startsAt: FUTURE_START,
          },
          failAuditPersistence,
        ),
      ).rejects.toBeInstanceOf(InjectedAuditFailure);

      await expectRollback(auditsBefore);
      const state = await getPlacementState(
        prisma,
        "HOME_HERO",
        new Date("2029-12-01T00:00:00.000Z"),
      );
      expect(state.current).toBeNull();
      expect(state.upcoming).toBeNull();
    });
  });

  describe("replacement", () => {
    it("rolls back the prior-row transition and replacement insert together", async () => {
      const { manager, publicationId } = await releasedStory();
      const original = await assignPlacement(prisma, manager, {
        key: "HOME_HERO",
        publicationId,
        startsAt: IMMEDIATE_START,
      });
      const auditsBefore = await successfulPlacementAuditCount();

      await expect(
        assignPlacement(
          prisma,
          manager,
          {
            key: "HOME_HERO",
            publicationId,
            startsAt: REPLACEMENT_START,
            expectedVersion: original.version,
          },
          failAuditPersistence,
        ),
      ).rejects.toBeInstanceOf(InjectedAuditFailure);

      const persisted = await placementRow(original.id);
      expect(persisted).toMatchObject({
        id: original.id,
        startsAt: IMMEDIATE_START,
        endsAt: null,
        version: original.version,
        publicationId,
      });
      expect(await placementRows()).toHaveLength(1);
      expect(await successfulPlacementAuditCount()).toBe(auditsBefore);
      expect(
        (await getPlacementState(prisma, "HOME_HERO", IMMEDIATE_START)).current
          ?.id,
      ).toBe(original.id);
    });

    it("leaves the original current and unchanged when audit fails after replacement insert", async () => {
      const { manager, publicationId } = await releasedStory();
      const original = await assignPlacement(prisma, manager, {
        key: "HOME_HERO",
        publicationId,
        startsAt: IMMEDIATE_START,
      });
      const auditsBefore = await successfulPlacementAuditCount();
      const replacedAuditsBefore =
        await placementAuditCount("placement.replaced");

      await expect(
        assignPlacement(
          prisma,
          manager,
          {
            key: "HOME_HERO",
            publicationId,
            startsAt: REPLACEMENT_START,
            endsAt: REPLACEMENT_END,
            expectedVersion: original.version,
          },
          failAuditPersistence,
        ),
      ).rejects.toBeInstanceOf(InjectedAuditFailure);

      expect(await placementRows()).toHaveLength(1);
      expect(await placementRow(original.id)).toMatchObject({
        startsAt: IMMEDIATE_START,
        endsAt: null,
        version: original.version,
      });
      expect(await successfulPlacementAuditCount()).toBe(auditsBefore);
      expect(await placementAuditCount("placement.replaced")).toBe(
        replacedAuditsBefore,
      );
    });
  });

  describe("clear/end", () => {
    it("rolls back clear/end and allows retry with the original version", async () => {
      const { manager, publicationId } = await releasedStory();
      const original = await assignPlacement(prisma, manager, {
        key: "HOME_HERO",
        publicationId,
        startsAt: new Date(Date.now() - 1_000),
      });
      const auditsBefore = await successfulPlacementAuditCount();
      const clearAuditsBefore = await placementAuditCount("placement.cleared");

      await expect(
        clearPlacement(
          prisma,
          manager,
          "HOME_HERO",
          original.version,
          failAuditPersistence,
        ),
      ).rejects.toBeInstanceOf(InjectedAuditFailure);

      expect(await placementRow(original.id)).toMatchObject({
        id: original.id,
        endsAt: null,
        version: original.version,
      });
      expect(await successfulPlacementAuditCount()).toBe(auditsBefore);
      expect(
        (await getEffectivePlacement(prisma, "HOME_HERO"))?.placement.id,
      ).toBe(original.id);

      await expect(
        clearPlacement(prisma, manager, "HOME_HERO", original.version),
      ).resolves.toBeUndefined();
      expect(await placementRow(original.id)).toMatchObject({
        id: original.id,
        endsAt: expect.any(Date),
        version: original.version + 1,
      });
      expect(await placementAuditCount("placement.cleared")).toBe(
        clearAuditsBefore + 1,
      );
    });

    it("does not create a replacement or cancellation artifact after failed clear", async () => {
      const { manager, publicationId } = await releasedStory();
      const original = await assignPlacement(prisma, manager, {
        key: "HOME_HERO",
        publicationId,
        startsAt: new Date(Date.now() - 1_000),
      });
      const replacedAuditsBefore =
        await placementAuditCount("placement.replaced");
      const cancelledAuditsBefore = await placementAuditCount(
        "placement.cancelled",
      );

      await expect(
        clearPlacement(
          prisma,
          manager,
          "HOME_HERO",
          original.version,
          failAuditPersistence,
        ),
      ).rejects.toBeInstanceOf(InjectedAuditFailure);

      expect(await placementRows()).toHaveLength(1);
      expect(await placementAuditCount("placement.replaced")).toBe(
        replacedAuditsBefore,
      );
      expect(await placementAuditCount("placement.cancelled")).toBe(
        cancelledAuditsBefore,
      );
    });
  });

  describe("future cancellation", () => {
    it("rolls back cancellation and allows retry with the original version", async () => {
      const { manager, publicationId } = await releasedStory();
      const original = await assignPlacement(prisma, manager, {
        key: "HOME_HERO",
        publicationId,
        startsAt: FUTURE_START,
      });
      const auditsBefore = await successfulPlacementAuditCount();
      const cancellationAuditsBefore = await placementAuditCount(
        "placement.cancelled",
      );

      await expect(
        cancelFuturePlacement(
          prisma,
          manager,
          original.id,
          original.version,
          failAuditPersistence,
        ),
      ).rejects.toBeInstanceOf(InjectedAuditFailure);

      expect(await placementRow(original.id)).toMatchObject({
        id: original.id,
        startsAt: FUTURE_START,
        endsAt: null,
        cancelledAt: null,
        version: original.version,
        publicationId,
      });
      expect(await successfulPlacementAuditCount()).toBe(auditsBefore);
      expect(
        (await getPlacementState(prisma, "HOME_HERO", new Date("2029-12-01")))
          .upcoming?.id,
      ).toBe(original.id);

      await expect(
        cancelFuturePlacement(prisma, manager, original.id, original.version),
      ).resolves.toBeUndefined();
      expect(await placementRow(original.id)).toMatchObject({
        id: original.id,
        startsAt: FUTURE_START,
        endsAt: null,
        cancelledAt: expect.any(Date),
        version: original.version + 1,
      });
      expect(
        (await getPlacementState(prisma, "HOME_HERO", new Date("2029-12-01")))
          .upcoming,
      ).toBeNull();
      expect(await placementAuditCount("placement.cancelled")).toBe(
        cancellationAuditsBefore + 1,
      );
    });

    it("does not create an ended or replacement artifact after failed cancellation", async () => {
      const { manager, publicationId } = await releasedStory();
      const original = await assignPlacement(prisma, manager, {
        key: "HOME_HERO",
        publicationId,
        startsAt: FUTURE_START,
      });
      const replacedAuditsBefore =
        await placementAuditCount("placement.replaced");
      const clearAuditsBefore = await placementAuditCount("placement.cleared");
      const cancellationAuditsBefore = await placementAuditCount(
        "placement.cancelled",
      );

      await expect(
        cancelFuturePlacement(
          prisma,
          manager,
          original.id,
          original.version,
          failAuditPersistence,
        ),
      ).rejects.toBeInstanceOf(InjectedAuditFailure);

      expect(await placementRows()).toHaveLength(1);
      expect(await placementAuditCount("placement.replaced")).toBe(
        replacedAuditsBefore,
      );
      expect(await placementAuditCount("placement.cleared")).toBe(
        clearAuditsBefore,
      );
      expect(await placementAuditCount("placement.cancelled")).toBe(
        cancellationAuditsBefore,
      );
    });
  });

  describe("audit atomicity", () => {
    it("keeps each successful placement mutation paired with its success audit", async () => {
      const { manager, publicationId } = await releasedStory();
      const currentStart = new Date(Date.now() - 2_000);
      const replacementStart = new Date(Date.now() - 1_000);
      const assignedAuditsBefore =
        await placementAuditCount("placement.assigned");
      const replacedAuditsBefore =
        await placementAuditCount("placement.replaced");
      const clearAuditsBefore = await placementAuditCount("placement.cleared");
      const cancellationAuditsBefore = await placementAuditCount(
        "placement.cancelled",
      );
      const assigned = await assignPlacement(prisma, manager, {
        key: "HOME_HERO",
        publicationId,
        startsAt: currentStart,
      });
      expect(await placementAuditCount("placement.assigned")).toBe(
        assignedAuditsBefore + 1,
      );

      const replacement = await assignPlacement(prisma, manager, {
        key: "HOME_HERO",
        publicationId,
        startsAt: replacementStart,
        expectedVersion: assigned.version,
      });
      expect(await placementAuditCount("placement.replaced")).toBe(
        replacedAuditsBefore + 1,
      );

      await clearPlacement(prisma, manager, "HOME_HERO", replacement.version);
      expect(await placementAuditCount("placement.cleared")).toBe(
        clearAuditsBefore + 1,
      );

      const future = await assignPlacement(prisma, manager, {
        key: "HOME_HERO",
        publicationId,
        startsAt: FUTURE_START,
      });
      expect(await placementAuditCount("placement.assigned")).toBe(
        assignedAuditsBefore + 2,
      );
      await cancelFuturePlacement(prisma, manager, future.id, future.version);
      expect(await placementAuditCount("placement.cancelled")).toBe(
        cancellationAuditsBefore + 1,
      );
    });
  });
});
