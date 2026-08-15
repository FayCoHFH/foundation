import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import type { Capability } from "@/platform/auth/capabilities";
import {
  approveStory,
  createStory,
  getStoryDraft,
  requestStoryChanges,
  saveStoryRevision,
  sendStoryForApproval,
  storyDocumentFromPlainText,
  submitStory,
} from "@/modules/communications/stories";
import {
  AuthorizationError,
  ConcurrencyError,
} from "@/platform/errors/app-error";

import { assertDestructiveTestDatabaseSafety } from "../support/destructive-test-database";

const testDatabase = assertDestructiveTestDatabaseSafety();
const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("@/generated/prisma/client");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabase.databaseUrl }),
});

type Actor = { adminUserId: string; capabilities: readonly Capability[] };

function candidate(title: string, body = "A private Story body.") {
  return {
    headline: title,
    deck: "An internal deck.",
    excerpt: "An internal excerpt for the candidate.",
    body: storyDocumentFromPlainText(body),
  };
}

async function actor(roleKey: string): Promise<Actor> {
  const suffix = randomUUID();
  const authUserId = `c1-auth-${suffix}`;
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  await prisma.user.create({
    data: {
      id: authUserId,
      name: `C1 ${role.name}`,
      email: `c1-${suffix}@example.org`,
      emailVerified: true,
      workspaceDomain: "example.org",
    },
  });
  const admin = await prisma.adminUser.create({
    data: { authUserId, status: "ACTIVE" },
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

async function storyActors() {
  return {
    contributor: await actor("contributor"),
    editor: await actor("editor"),
    manager: await actor("communications-manager"),
    platformAdmin: await actor("platform-admin"),
  };
}

beforeAll(async () => {
  await prisma.role.findUniqueOrThrow({ where: { key: "contributor" } });
});

describe("C1 Story persistence", () => {
  it("creates the Story root, responsibility, revision, lifecycle evidence, and audit atomically", async () => {
    const { contributor } = await storyActors();
    const created = await createStory(
      prisma,
      contributor,
      candidate("Created Story"),
    );
    expect(created.workflow).toBe("DRAFT");
    expect(created.version).toBe(1);
    expect(created.currentRevision.number).toBe(1);
    await expect(
      prisma.story.findUniqueOrThrow({
        where: { id: created.storyId },
        include: {
          publication: {
            include: { responsibility: true, currentRevision: true },
          },
        },
      }),
    ).resolves.toMatchObject({
      publication: {
        kind: "STORY",
        workflowState: "DRAFT",
        responsibility: { editorialOwnerAdminUserId: contributor.adminUserId },
        currentRevision: { number: 1 },
      },
    });
    await expect(
      prisma.auditEvent.count({
        where: { action: "story.create", targetId: created.storyId },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.publicationLifecycleTransition.count({
        where: {
          publicationId: created.publicationId,
          action: "DRAFT_CREATED",
        },
      }),
    ).resolves.toBe(1);
  });

  it("creates immutable successor revisions and rejects unauthorized editing", async () => {
    const { contributor, platformAdmin } = await storyActors();
    const created = await createStory(
      prisma,
      contributor,
      candidate("Immutable Story"),
    );
    await expect(
      saveStoryRevision(prisma, platformAdmin, {
        storyId: created.storyId,
        expectedVersion: created.version,
        ...candidate("Unauthorized overwrite"),
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    const saved = await saveStoryRevision(prisma, contributor, {
      storyId: created.storyId,
      expectedVersion: created.version,
      ...candidate("Immutable Story v2", "A changed private body."),
    });
    expect(saved.currentRevision.number).toBe(2);
    expect(saved.workflow).toBe("DRAFT");
    const revisions = await prisma.publicationRevision.findMany({
      where: { publicationId: created.publicationId },
      orderBy: { number: "asc" },
    });
    expect(revisions.map((revision) => revision.headline)).toEqual([
      "Immutable Story",
      "Immutable Story v2",
    ]);
    await expect(
      prisma.publicationRevision.update({
        where: { id: revisions[0]!.id },
        data: { headline: "Mutation must fail" },
      }),
    ).rejects.toThrow(/immutable/);
  });

  it("persists submit, changes-requested, resubmission, review, and exact-hash approval history", async () => {
    const { contributor, editor, manager } = await storyActors();
    const created = await createStory(
      prisma,
      contributor,
      candidate("Workflow Story"),
    );
    const submitted = await submitStory(prisma, contributor, {
      storyId: created.storyId,
      expectedVersion: created.version,
      expectedContentHash: created.currentRevision.contentHash,
    });
    const changes = await requestStoryChanges(prisma, editor, {
      storyId: created.storyId,
      expectedVersion: submitted.version,
      expectedContentHash: submitted.currentRevision.contentHash,
      reason: "Please clarify the opening context.",
    });
    expect(changes.workflow).toBe("CHANGES_REQUESTED");
    const successor = await saveStoryRevision(prisma, contributor, {
      storyId: created.storyId,
      expectedVersion: changes.version,
      ...candidate("Workflow Story revised", "Clarified private context."),
    });
    const resubmitted = await submitStory(prisma, contributor, {
      storyId: created.storyId,
      expectedVersion: successor.version,
      expectedContentHash: successor.currentRevision.contentHash,
    });
    const pending = await sendStoryForApproval(prisma, editor, {
      storyId: created.storyId,
      expectedVersion: resubmitted.version,
      expectedContentHash: resubmitted.currentRevision.contentHash,
    });
    const approved = await approveStory(prisma, manager, {
      storyId: created.storyId,
      expectedVersion: pending.version,
      expectedContentHash: pending.currentRevision.contentHash,
    });
    expect(approved.workflow).toBe("APPROVED");
    expect(approved.approval).toMatchObject({
      revisionId: approved.currentRevision.id,
      contentHash: approved.currentRevision.contentHash,
      approvedByAdminUserId: manager.adminUserId,
    });
    await expect(
      prisma.publicationLifecycleTransition.findMany({
        where: { publicationId: created.publicationId },
        select: { action: true },
        orderBy: { occurredAt: "asc" },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        { action: "SUBMITTED" },
        { action: "CHANGES_REQUESTED" },
        { action: "SENT_FOR_APPROVAL" },
        { action: "APPROVED" },
      ]),
    );
    await expect(
      prisma.auditEvent.count({
        where: { targetId: created.storyId, action: { startsWith: "story." } },
      }),
    ).resolves.toBeGreaterThanOrEqual(6);
  });

  it("keeps historical approval evidence but invalidates the current approved candidate after editing", async () => {
    const { contributor, editor, manager } = await storyActors();
    const created = await createStory(
      prisma,
      contributor,
      candidate("Approved then changed"),
    );
    const submitted = await submitStory(prisma, contributor, {
      storyId: created.storyId,
      expectedVersion: 1,
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
    const revised = await saveStoryRevision(prisma, contributor, {
      storyId: created.storyId,
      expectedVersion: approved.version,
      ...candidate("Approved then changed again"),
    });
    expect(revised.workflow).toBe("DRAFT");
    expect(revised.approval).toBeNull();
    await expect(
      prisma.publicationApproval.count({
        where: { publicationId: created.publicationId },
      }),
    ).resolves.toBe(1);
  });

  it("denies normal self-approval and stale writes without data loss", async () => {
    const { manager } = await storyActors();
    const created = await createStory(
      prisma,
      manager,
      candidate("Self approval denied"),
    );
    const submitted = await submitStory(prisma, manager, {
      storyId: created.storyId,
      expectedVersion: 1,
      expectedContentHash: created.currentRevision.contentHash,
    });
    const pending = await sendStoryForApproval(prisma, manager, {
      storyId: created.storyId,
      expectedVersion: submitted.version,
      expectedContentHash: submitted.currentRevision.contentHash,
    });
    await expect(
      approveStory(prisma, manager, {
        storyId: created.storyId,
        expectedVersion: pending.version,
        expectedContentHash: pending.currentRevision.contentHash,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const fresh = await createStory(
      prisma,
      manager,
      candidate("Concurrency Story"),
    );
    const saved = await saveStoryRevision(prisma, manager, {
      storyId: fresh.storyId,
      expectedVersion: fresh.version,
      ...candidate("Concurrency Story current"),
    });
    await expect(
      saveStoryRevision(prisma, manager, {
        storyId: fresh.storyId,
        expectedVersion: fresh.version,
        ...candidate("Concurrency Story stale"),
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(
      getStoryDraft(prisma, manager, fresh.storyId),
    ).resolves.toMatchObject({
      currentRevision: { headline: "Concurrency Story current" },
      version: saved.version,
    });

    const concurrent = await createStory(
      prisma,
      manager,
      candidate("Parallel concurrency Story"),
    );
    const results = await Promise.allSettled([
      saveStoryRevision(prisma, manager, {
        storyId: concurrent.storyId,
        expectedVersion: concurrent.version,
        ...candidate("Parallel first candidate"),
      }),
      saveStoryRevision(prisma, manager, {
        storyId: concurrent.storyId,
        expectedVersion: concurrent.version,
        ...candidate("Parallel second candidate"),
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected?.reason).toBeInstanceOf(ConcurrencyError);
  });

  it("rolls back Story creation when required responsibility cannot be established", async () => {
    const { manager } = await storyActors();
    const before = await prisma.publication.count();
    await expect(
      createStory(prisma, manager, {
        ...candidate("Rollback Story"),
        editorialOwnerAdminUserId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(prisma.publication.count()).resolves.toBe(before);
  });
});
