import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  approveProject,
  createProject,
  getPublicProjectBySlug,
  listCurrentPublicProjects,
  listPublicProjects,
  projectDocumentFromPlainText,
  releaseProject,
  saveProjectRevision,
  sendProjectForApproval,
  submitProject,
  withdrawProject,
  type ProjectCandidate,
} from "@/modules/communications/projects";
import type { Capability } from "@/platform/auth/capabilities";
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

async function actor(roleKey: string): Promise<Actor> {
  const suffix = randomUUID();
  const authUserId = `p1-auth-${suffix}`;
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  await prisma.user.create({
    data: {
      id: authUserId,
      name: `P1 ${role.name}`,
      email: `p1-${suffix}@example.org`,
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

function candidate(
  overrides: Partial<ProjectCandidate> = {},
): ProjectCandidate {
  return {
    title: `P1 project ${randomUUID()}`,
    summary: "A safe public summary for a Fayette County Habitat project.",
    projectType: "NEW_HOME",
    projectStatus: "PLANNED",
    community: "Lexington",
    county: "Fayette County",
    publicArea: "North Lexington",
    startDate: new Date("2026-01-10T00:00:00.000Z"),
    completionDate: new Date("2026-10-10T00:00:00.000Z"),
    body: projectDocumentFromPlainText("A public project description."),
    impactFacts: [
      { label: "Homes built", value: "1", unit: "home", sortOrder: 0 },
      { label: "Families served", value: "1", unit: "family", sortOrder: 1 },
    ],
    ...overrides,
  };
}

describe("P1 Project PostgreSQL domain", () => {
  let contributor: Actor;
  let editor: Actor;
  let manager: Actor;
  let publisher: Actor;

  beforeAll(async () => {
    await prisma.role.findUniqueOrThrow({ where: { key: "contributor" } });
    contributor = await actor("contributor");
    editor = await actor("editor");
    manager = await actor("communications-manager");
    publisher = await actor("publisher");
  });

  it.each([
    ["NEW_HOME", "PLANNED"],
    ["NEW_HOME", "IN_PROGRESS"],
    ["NEW_HOME", "COMPLETED"],
    ["NEW_HOME", "PAUSED"],
    ["NEW_HOME", "CANCELLED"],
    ["HOME_REPAIR", "PLANNED"],
    ["HOME_REPAIR", "IN_PROGRESS"],
    ["HOME_REPAIR", "COMPLETED"],
    ["HOME_REPAIR", "PAUSED"],
    ["HOME_REPAIR", "CANCELLED"],
    ["REHABILITATION", "PLANNED"],
    ["REHABILITATION", "IN_PROGRESS"],
    ["REHABILITATION", "COMPLETED"],
    ["REHABILITATION", "PAUSED"],
    ["REHABILITATION", "CANCELLED"],
    ["ACCESSIBILITY", "PLANNED"],
    ["ACCESSIBILITY", "IN_PROGRESS"],
    ["ACCESSIBILITY", "COMPLETED"],
    ["ACCESSIBILITY", "PAUSED"],
    ["ACCESSIBILITY", "CANCELLED"],
    ["COMMUNITY", "PLANNED"],
    ["COMMUNITY", "IN_PROGRESS"],
    ["COMMUNITY", "COMPLETED"],
    ["COMMUNITY", "PAUSED"],
    ["COMMUNITY", "CANCELLED"],
    ["OTHER", "PLANNED"],
    ["OTHER", "IN_PROGRESS"],
    ["OTHER", "COMPLETED"],
    ["OTHER", "PAUSED"],
    ["OTHER", "CANCELLED"],
  ] as const)(
    "persists the typed %s / %s combination",
    async (projectType, projectStatus) => {
      const created = await createProject(
        prisma,
        contributor,
        candidate({ projectType, projectStatus }),
      );
      expect(created.currentRevision.projectType).toBe(projectType);
      expect(created.currentRevision.projectStatus).toBe(projectStatus);
      expect(
        created.currentRevision.impactFacts.map(({ sortOrder }) => sortOrder),
      ).toEqual([0, 1]);
    },
  );

  it("enforces capability, ownership, stale version, and stale hash checks at the service boundary", async () => {
    const created = await createProject(prisma, contributor, candidate());
    await expect(
      createProject(prisma, editor, candidate()),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      saveProjectRevision(prisma, publisher, {
        ...candidate(),
        projectId: created.projectId,
        expectedVersion: created.version,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    const saved = await saveProjectRevision(prisma, contributor, {
      ...candidate({ title: "Updated P1 project" }),
      projectId: created.projectId,
      expectedVersion: created.version,
    });
    await expect(
      saveProjectRevision(prisma, contributor, {
        ...candidate(),
        projectId: created.projectId,
        expectedVersion: created.version,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(
      submitProject(prisma, contributor, {
        projectId: created.projectId,
        expectedVersion: saved.version,
        expectedContentHash: created.currentRevision.contentHash,
      }),
    ).rejects.toThrow(/candidate changed/i);
  });

  it("runs the exact revision through review, approval, release, projection, and withdrawal", async () => {
    const created = await createProject(
      prisma,
      contributor,
      candidate({ projectStatus: "IN_PROGRESS" }),
    );
    const submitted = await submitProject(prisma, contributor, {
      projectId: created.projectId,
      expectedVersion: created.version,
      expectedContentHash: created.currentRevision.contentHash,
    });
    const pending = await sendProjectForApproval(prisma, editor, {
      projectId: created.projectId,
      expectedVersion: submitted.version,
      expectedContentHash: submitted.currentRevision.contentHash,
    });
    await expect(
      approveProject(prisma, contributor, {
        projectId: created.projectId,
        expectedVersion: pending.version,
        expectedContentHash: pending.currentRevision.contentHash,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    const approved = await approveProject(prisma, manager, {
      projectId: created.projectId,
      expectedVersion: pending.version,
      expectedContentHash: pending.currentRevision.contentHash,
    });
    const released = await releaseProject(prisma, manager, {
      projectId: created.projectId,
      expectedVersion: approved.version,
      expectedContentHash: approved.currentRevision.contentHash,
      slug: `p1-${randomUUID()}`,
    });
    const slug = released.slug!;
    const projection = await prisma.publicProjectProjection.findUniqueOrThrow({
      where: { slug },
      include: { impactFacts: { orderBy: { sortOrder: "asc" } } },
    });
    const snapshot = await prisma.publicationSnapshot.findUniqueOrThrow({
      where: { id: projection.snapshotId },
    });
    expect(projection.body).toEqual(
      expect.objectContaining({ schemaVersion: 1 }),
    );
    expect(projection.impactFacts.map(({ sortOrder }) => sortOrder)).toEqual([
      0, 1,
    ]);
    expect(snapshot.payload).toEqual(
      expect.objectContaining({ projectStatus: "IN_PROGRESS" }),
    );
    expect(projection).not.toHaveProperty("publicationRevisionId");
    expect(projection).not.toHaveProperty("createdByAdminUserId");
    expect(await getPublicProjectBySlug(prisma, slug)).toEqual(
      expect.objectContaining({ slug, projectStatus: "IN_PROGRESS" }),
    );
    const withdrawn = await withdrawProject(prisma, manager, {
      projectId: created.projectId,
      expectedVersion: released.version,
      reason: "P1 regression withdrawal",
    });
    expect(withdrawn.releaseState).toBe("WITHDRAWN");
    expect(await getPublicProjectBySlug(prisma, slug)).toBeNull();
  });

  it("keeps public reads projection-only and distinguishes active from historical statuses", async () => {
    const active = await createProject(
      prisma,
      contributor,
      candidate({ projectStatus: "PAUSED" }),
    );
    const submitted = await submitProject(prisma, contributor, {
      projectId: active.projectId,
      expectedVersion: active.version,
      expectedContentHash: active.currentRevision.contentHash,
    });
    const pending = await sendProjectForApproval(prisma, editor, {
      projectId: active.projectId,
      expectedVersion: submitted.version,
      expectedContentHash: submitted.currentRevision.contentHash,
    });
    const approved = await approveProject(prisma, manager, {
      projectId: active.projectId,
      expectedVersion: pending.version,
      expectedContentHash: pending.currentRevision.contentHash,
    });
    const released = await releaseProject(prisma, manager, {
      projectId: active.projectId,
      expectedVersion: approved.version,
      expectedContentHash: approved.currentRevision.contentHash,
      slug: `p1-paused-${randomUUID()}`,
    });
    const all = await listPublicProjects(prisma, { limit: 100 });
    const current = await listCurrentPublicProjects(prisma, { limit: 100 });
    expect(all.some((item) => item.slug === released.slug)).toBe(true);
    expect(current.some((item) => item.slug === released.slug)).toBe(true);
    expect(all.find((item) => item.slug === released.slug)).toEqual(
      expect.objectContaining({ projectStatus: "PAUSED" }),
    );
    const revision = await prisma.publicationRevision.findUniqueOrThrow({
      where: {
        id: (
          await prisma.publication.findUniqueOrThrow({
            where: { id: released.publicationId },
          })
        ).currentRevisionId!,
      },
    });
    expect(revision.body).toEqual(
      expect.objectContaining({ schemaVersion: 1 }),
    );
  });

  it("keeps the previous public snapshot immutable while releasing a successor revision", async () => {
    const created = await createProject(prisma, contributor, candidate());
    const submitted = await submitProject(prisma, contributor, {
      projectId: created.projectId,
      expectedVersion: created.version,
      expectedContentHash: created.currentRevision.contentHash,
    });
    const pending = await sendProjectForApproval(prisma, editor, {
      projectId: created.projectId,
      expectedVersion: submitted.version,
      expectedContentHash: submitted.currentRevision.contentHash,
    });
    const approved = await approveProject(prisma, manager, {
      projectId: created.projectId,
      expectedVersion: pending.version,
      expectedContentHash: pending.currentRevision.contentHash,
    });
    const firstSlug = `p1-successor-original-${randomUUID()}`;
    const released = await releaseProject(prisma, manager, {
      projectId: created.projectId,
      expectedVersion: approved.version,
      expectedContentHash: approved.currentRevision.contentHash,
      slug: firstSlug,
    });
    const firstSnapshot = await prisma.publicationSnapshot.findFirstOrThrow({
      where: { publicationId: released.publicationId },
      orderBy: { activatedAt: "asc" },
    });
    const successor = await saveProjectRevision(prisma, contributor, {
      ...candidate({
        title: "P1 successor project",
        projectStatus: "COMPLETED",
        summary: "The successor public summary.",
      }),
      projectId: created.projectId,
      expectedVersion: released.version,
    });
    const successorSubmitted = await submitProject(prisma, contributor, {
      projectId: created.projectId,
      expectedVersion: successor.version,
      expectedContentHash: successor.currentRevision.contentHash,
    });
    const successorPending = await sendProjectForApproval(prisma, editor, {
      projectId: created.projectId,
      expectedVersion: successorSubmitted.version,
      expectedContentHash: successorSubmitted.currentRevision.contentHash,
    });
    const successorApproved = await approveProject(prisma, manager, {
      projectId: created.projectId,
      expectedVersion: successorPending.version,
      expectedContentHash: successorPending.currentRevision.contentHash,
    });
    const secondSlug = `p1-successor-current-${randomUUID()}`;
    const releasedSuccessor = await releaseProject(prisma, manager, {
      projectId: created.projectId,
      expectedVersion: successorApproved.version,
      expectedContentHash: successorApproved.currentRevision.contentHash,
      slug: secondSlug,
    });
    const snapshots = await prisma.publicationSnapshot.findMany({
      where: { publicationId: releasedSuccessor.publicationId },
      orderBy: { activatedAt: "asc" },
    });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]?.payload).toEqual(firstSnapshot.payload);
    expect(await getPublicProjectBySlug(prisma, secondSlug)).toEqual(
      expect.objectContaining({
        title: "P1 successor project",
        projectStatus: "COMPLETED",
      }),
    );
  });

  it("records bounded project audit actions without copying the editorial body", async () => {
    const created = await createProject(prisma, contributor, candidate());
    const events = await prisma.auditEvent.findMany({
      where: { targetType: "Project", targetId: created.projectId },
      orderBy: { occurredAt: "asc" },
    });
    expect(events.some((event) => event.action === "project.create")).toBe(
      true,
    );
    expect(
      events.every(
        (event) =>
          !JSON.stringify(event.summary).includes("public project description"),
      ),
    ).toBe(true);
    expect(events.every((event) => event.targetType === "Project")).toBe(true);
  });
});
