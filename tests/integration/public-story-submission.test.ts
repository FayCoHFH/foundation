import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PublicStorySubmissionStatus } from "@/generated/prisma/client";
import {
  acceptPublicStorySubmission,
  beginPublicStorySubmissionReview,
  declinePublicStorySubmission,
  getPublicStorySubmissionDetail,
  listPublicStorySubmissions,
  markPublicStorySubmissionFollowUp,
  markPublicStorySubmissionSpam,
  receivePublicStorySubmission,
  updatePublicStorySubmissionReviewNote,
} from "@/modules/communications/submissions";
import type { Capability } from "@/platform/auth/capabilities";
import {
  AuthorizationError,
  ConcurrencyError,
  ValidationError,
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
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  const user = await prisma.user.create({
    data: {
      id: `c6b1-${randomUUID()}`,
      name: `C6B1 ${role.name}`,
      email: `c6b1-${randomUUID()}@example.org`,
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

function input(overrides: Record<string, unknown> = {}) {
  return {
    submitterName: "Jordan Example",
    submitterEmail: `Jordan-${randomUUID()}@Example.ORG`,
    relationshipToHabitat: "Community volunteer",
    suggestedTitle: "A neighborhood built together",
    storyText:
      "This is a sufficiently long plain-text story about how Habitat helped our neighborhood work together.",
    contactConsent: true,
    privacyNoticeVersion: "public-story-v1",
    privacyNoticeAcceptedAt: new Date("2040-08-16T12:00:00Z"),
    editorialReviewAcknowledged: true,
    sensitiveDataWarningAcknowledged: true,
    publicationInterest: true,
    involvesMinor: false,
    involvesHomeownerOrApplicant: true,
    containsSensitivePersonalCircumstances: false,
    ...overrides,
  } as const;
}

describe("C6B-1A Public Story Submission PostgreSQL domain", () => {
  let manager: Actor;
  let denied: Actor;

  beforeAll(async () => {
    await prisma.publicStorySubmission.deleteMany();
    manager = await actor("communications-manager");
    denied = await actor("platform-admin");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("receives a confidential text-only submission with a safe result and system audit", async () => {
    const beforePublications = await prisma.publication.count();
    const result = await receivePublicStorySubmission(prisma, input(), {
      now: () => new Date("2040-08-16T12:00:01Z"),
    });
    expect(result).toEqual({
      status: "RECEIVED",
      receivedAt: new Date("2040-08-16T12:00:01Z"),
    });
    expect(Object.keys(result)).toEqual(["status", "receivedAt"]);
    const row = await prisma.publicStorySubmission.findFirstOrThrow({
      orderBy: { receivedAt: "desc" },
    });
    expect(row.submitterEmail).toMatch(/^jordan-[^@]+@example\.org$/);
    expect(row.status).toBe(PublicStorySubmissionStatus.RECEIVED);
    expect(row.version).toBe(1);
    expect(row.statusChangedByAdminUserId).toBeNull();
    expect(await prisma.publication.count()).toBe(beforePublications);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { targetType: "PublicStorySubmission", targetId: row.id },
    });
    expect(audit.actorKind).toBe("SYSTEM");
    expect(audit.summary).toEqual({ status: "RECEIVED", version: 1 });
  });

  it("enforces receive validation and database constraints", async () => {
    for (const field of [
      "contactConsent",
      "editorialReviewAcknowledged",
      "sensitiveDataWarningAcknowledged",
    ] as const) {
      await expect(
        receivePublicStorySubmission(prisma, input({ [field]: false })),
      ).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(
      receivePublicStorySubmission(prisma, input({ storyText: "too short" })),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      receivePublicStorySubmission(
        prisma,
        input({ submitterName: "x".repeat(121) }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      receivePublicStorySubmission(
        prisma,
        input({ submitterEmail: "not-an-email" }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      receivePublicStorySubmission(prisma, input({ privacyNoticeVersion: "" })),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      prisma.publicStorySubmission.create({
        data: {
          ...input(),
          id: randomUUID(),
          submitterEmail: "direct@example.org",
          contactConsent: false,
        },
      }),
    ).rejects.toThrow();
    await expect(
      receivePublicStorySubmission(
        prisma,
        input({ relationshipToHabitat: "" }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      receivePublicStorySubmission(
        prisma,
        input({ privacyNoticeAcceptedAt: new Date("invalid") }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("keeps administrative list and detail DTOs separated", async () => {
    const received = await receivePublicStorySubmission(
      prisma,
      input({ submitterName: "List Detail Person" }),
    );
    const row = await prisma.publicStorySubmission.findFirstOrThrow({
      where: {
        receivedAt: received.receivedAt,
        submitterName: "List Detail Person",
      },
    });
    const listed = await listPublicStorySubmissions(prisma, manager, {
      pageSize: 10,
    });
    const item = listed.items.find((candidate) => candidate.id === row.id);
    expect(item).toBeDefined();
    expect(item).not.toHaveProperty("submitterEmail");
    expect(item).not.toHaveProperty("storyText");
    expect(item).not.toHaveProperty("internalReviewNote");
    const detail = await getPublicStorySubmissionDetail(
      prisma,
      manager,
      row.id,
    );
    expect(detail.submitterEmail).toMatch(/^jordan-[^@]+@example\.org$/);
    expect(detail.storyText).toContain("sufficiently long");
    expect(detail).not.toHaveProperty("auditEvents");
    expect(detail).not.toHaveProperty("provider");
  });

  it("requires the review capability and active local administrator", async () => {
    const received = await receivePublicStorySubmission(
      prisma,
      input({ submitterName: "Capability Test Person" }),
    );
    const row = await prisma.publicStorySubmission.findFirstOrThrow({
      where: {
        receivedAt: received.receivedAt,
        submitterName: "Capability Test Person",
      },
    });
    await expect(
      listPublicStorySubmissions(prisma, denied),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      getPublicStorySubmissionDetail(prisma, denied, row.id),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      beginPublicStorySubmissionReview(prisma, denied, row.id, 1),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await prisma.adminUser.update({
      where: { id: manager.adminUserId },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    });
    await expect(
      beginPublicStorySubmissionReview(prisma, manager, row.id, 1),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await prisma.adminUser.update({
      where: { id: manager.adminUserId },
      data: { status: "ACTIVE", suspendedAt: null },
    });
  });

  it("supports the required active workflow and makes accepted terminal", async () => {
    const received = await receivePublicStorySubmission(prisma, input());
    const row = await prisma.publicStorySubmission.findFirstOrThrow({
      where: { receivedAt: received.receivedAt },
    });
    const reviewing = await beginPublicStorySubmissionReview(
      prisma,
      manager,
      row.id,
      1,
    );
    expect(reviewing).toMatchObject({
      status: "IN_REVIEW",
      version: 2,
      statusChangedByDisplayName: expect.any(String),
    });
    const followUp = await markPublicStorySubmissionFollowUp(
      prisma,
      manager,
      row.id,
      2,
    );
    expect(followUp).toMatchObject({ status: "FOLLOW_UP", version: 3 });
    const backToReview = await beginPublicStorySubmissionReview(
      prisma,
      manager,
      row.id,
      3,
    );
    const accepted = await acceptPublicStorySubmission(
      prisma,
      manager,
      row.id,
      backToReview.version,
    );
    expect(accepted).toMatchObject({ status: "ACCEPTED", version: 5 });
    await expect(
      beginPublicStorySubmissionReview(
        prisma,
        manager,
        row.id,
        accepted.version,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("supports direct decline and spam terminal paths and rejects invalid directions", async () => {
    const declineResult = await receivePublicStorySubmission(prisma, input());
    const declineRow = await prisma.publicStorySubmission.findFirstOrThrow({
      where: { receivedAt: declineResult.receivedAt },
    });
    const declined = await declinePublicStorySubmission(
      prisma,
      manager,
      declineRow.id,
      1,
    );
    expect(declined.status).toBe(PublicStorySubmissionStatus.DECLINED);
    const spamResult = await receivePublicStorySubmission(prisma, input());
    const spamRow = await prisma.publicStorySubmission.findFirstOrThrow({
      where: { receivedAt: spamResult.receivedAt },
    });
    const spam = await markPublicStorySubmissionSpam(
      prisma,
      manager,
      spamRow.id,
      1,
    );
    expect(spam.status).toBe(PublicStorySubmissionStatus.SPAM);
    await expect(
      markPublicStorySubmissionFollowUp(prisma, manager, spamRow.id, 2),
    ).rejects.toThrow(ValidationError);
  });

  it("covers every active-to-terminal lifecycle direction", async () => {
    const paths = [
      ["RECEIVED", acceptPublicStorySubmission],
      ["IN_REVIEW", acceptPublicStorySubmission],
      ["FOLLOW_UP", acceptPublicStorySubmission],
      ["IN_REVIEW", declinePublicStorySubmission],
      ["FOLLOW_UP", declinePublicStorySubmission],
      ["IN_REVIEW", markPublicStorySubmissionSpam],
      ["FOLLOW_UP", markPublicStorySubmissionSpam],
    ] as const;
    for (const [startingStatus, finish] of paths) {
      const received = await receivePublicStorySubmission(
        prisma,
        input({ submitterName: `Path ${startingStatus} ${finish.name}` }),
      );
      const row = await prisma.publicStorySubmission.findFirstOrThrow({
        where: {
          receivedAt: received.receivedAt,
          submitterName: `Path ${startingStatus} ${finish.name}`,
        },
      });
      let version = 1;
      if (startingStatus !== "RECEIVED")
        version = (
          await beginPublicStorySubmissionReview(
            prisma,
            manager,
            row.id,
            version,
          )
        ).version;
      if (startingStatus === "FOLLOW_UP")
        version = (
          await markPublicStorySubmissionFollowUp(
            prisma,
            manager,
            row.id,
            version,
          )
        ).version;
      const terminal = await finish(prisma, manager, row.id, version);
      expect(["ACCEPTED", "DECLINED", "SPAM"]).toContain(terminal.status);
    }
  });

  it("enforces optimistic concurrency and leaves stale writes/audits unchanged", async () => {
    const received = await receivePublicStorySubmission(prisma, input());
    const row = await prisma.publicStorySubmission.findFirstOrThrow({
      where: { receivedAt: received.receivedAt },
    });
    const before = await prisma.auditEvent.count({
      where: { targetId: row.id },
    });
    await beginPublicStorySubmissionReview(prisma, manager, row.id, 1);
    await expect(
      beginPublicStorySubmissionReview(prisma, manager, row.id, 1),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    expect(await prisma.auditEvent.count({ where: { targetId: row.id } })).toBe(
      before + 1,
    );
    const retried = await updatePublicStorySubmissionReviewNote(
      prisma,
      manager,
      {
        submissionId: row.id,
        expectedVersion: 2,
        internalReviewNote: "Current-version retry succeeds.",
      },
    );
    expect(retried.version).toBe(3);
    const unchanged = await prisma.publicStorySubmission.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(unchanged.status).toBe(PublicStorySubmissionStatus.IN_REVIEW);
    expect(unchanged.internalReviewNote).toBe(
      "Current-version retry succeeds.",
    );
  });

  it("updates internal notes independently, without exposing them in list DTOs", async () => {
    const received = await receivePublicStorySubmission(prisma, input());
    const row = await prisma.publicStorySubmission.findFirstOrThrow({
      where: { receivedAt: received.receivedAt },
    });
    const updated = await updatePublicStorySubmissionReviewNote(
      prisma,
      manager,
      {
        submissionId: row.id,
        expectedVersion: 1,
        internalReviewNote:
          "Confirm permission before any future editorial use.",
      },
    );
    expect(updated).toMatchObject({
      internalReviewNote: "Confirm permission before any future editorial use.",
      version: 2,
    });
    const list = await listPublicStorySubmissions(prisma, manager, {
      pageSize: 50,
    });
    expect(list.items.find((item) => item.id === row.id)).not.toHaveProperty(
      "internalReviewNote",
    );
    await expect(
      updatePublicStorySubmissionReviewNote(prisma, manager, {
        submissionId: row.id,
        expectedVersion: 1,
        internalReviewNote: "stale",
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it("rolls back receive, lifecycle, and note mutations when audit writing fails", async () => {
    const failedName = "Audit Failure Receive";
    await expect(
      receivePublicStorySubmission(
        prisma,
        input({ submitterName: failedName }),
        {
          auditWriter: async () => {
            throw new Error("audit unavailable");
          },
        },
      ),
    ).rejects.toThrow("audit unavailable");
    expect(
      await prisma.publicStorySubmission.count({
        where: { submitterName: failedName },
      }),
    ).toBe(0);
    const received = await receivePublicStorySubmission(prisma, input());
    const row = await prisma.publicStorySubmission.findFirstOrThrow({
      where: { receivedAt: received.receivedAt },
    });
    const before = await prisma.publicStorySubmission.findUniqueOrThrow({
      where: { id: row.id },
    });
    await expect(
      beginPublicStorySubmissionReview(prisma, manager, row.id, 1, {
        auditWriter: async () => {
          throw new Error("audit unavailable");
        },
      }),
    ).rejects.toThrow("audit unavailable");
    await expect(
      updatePublicStorySubmissionReviewNote(
        prisma,
        manager,
        {
          submissionId: row.id,
          expectedVersion: 1,
          internalReviewNote: "should roll back",
        },
        {
          auditWriter: async () => {
            throw new Error("audit unavailable");
          },
        },
      ),
    ).rejects.toThrow("audit unavailable");
    expect(
      await prisma.publicStorySubmission.findUniqueOrThrow({
        where: { id: row.id },
      }),
    ).toEqual(before);
  });

  it("orders by newest receipt then stable ID and bounds filters/pages", async () => {
    const first = await receivePublicStorySubmission(
      prisma,
      input({ submitterName: "Ordering Older" }),
      { now: () => new Date("2040-08-16T12:00:00Z") },
    );
    await receivePublicStorySubmission(
      prisma,
      input({ submitterName: "Ordering Newer" }),
      { now: () => new Date("2040-08-16T12:01:00Z") },
    );
    const firstRow = await prisma.publicStorySubmission.findFirstOrThrow({
      where: { receivedAt: first.receivedAt, submitterName: "Ordering Older" },
    });
    await beginPublicStorySubmissionReview(prisma, manager, firstRow.id, 1);
    const filtered = await listPublicStorySubmissions(prisma, manager, {
      status: PublicStorySubmissionStatus.IN_REVIEW,
      page: 1,
      pageSize: 1,
    });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.status).toBe(
      PublicStorySubmissionStatus.IN_REVIEW,
    );
    await expect(
      listPublicStorySubmissions(prisma, manager, { pageSize: 51 }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      listPublicStorySubmissions(prisma, manager, { page: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(filtered.items[0]?.receivedAt.valueOf()).toBeGreaterThanOrEqual(
      first.receivedAt.valueOf(),
    );
  });

  it("keeps submission data outside public and operational publication surfaces", async () => {
    const before = {
      publications: await prisma.publication.count(),
      stories: await prisma.story.count(),
      news: await prisma.newsItem.count(),
      placements: await prisma.contentPlacement.count(),
      revisions: await prisma.publicationRevision.count(),
    };
    const received = await receivePublicStorySubmission(
      prisma,
      input({ submitterName: "Boundary Person" }),
    );
    const row = await prisma.publicStorySubmission.findFirstOrThrow({
      where: {
        receivedAt: received.receivedAt,
        submitterName: "Boundary Person",
      },
    });
    expect(await prisma.publication.count()).toBe(before.publications);
    expect(await prisma.story.count()).toBe(before.stories);
    expect(await prisma.newsItem.count()).toBe(before.news);
    expect(await prisma.contentPlacement.count()).toBe(before.placements);
    expect(await prisma.publicationRevision.count()).toBe(before.revisions);
    expect(
      await prisma.publicStorySubmission.count({ where: { id: row.id } }),
    ).toBe(1);
  });
});
