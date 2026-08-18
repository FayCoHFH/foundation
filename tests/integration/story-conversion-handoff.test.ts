import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PublicStorySubmissionStatus } from "@/generated/prisma/client";
import {
  convertPublicStorySubmissionToStory,
  getPublicStorySubmissionStoryConversion,
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

type Actor = Readonly<{
  adminUserId: string;
  capabilities: readonly Capability[];
}>;

const reviewCapability = "communications.submissions.review" as const;
const createCapability = "stories.create" as const;
const fixturePrefix = `C6B6-${randomUUID()}`;

async function actor(roleKey: string): Promise<Actor> {
  const suffix = randomUUID();
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  const user = await prisma.user.create({
    data: {
      id: `c6b6-${suffix}`,
      name: `C6B6 ${role.name}`,
      email: `c6b6-${suffix}@example.org`,
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

async function submission(
  status: PublicStorySubmissionStatus = PublicStorySubmissionStatus.ACCEPTED,
  statusChangedByAdminUserId?: string,
) {
  const email = `${fixturePrefix.toLowerCase()}-${randomUUID()}@example.org`;
  const statusActor =
    status === PublicStorySubmissionStatus.RECEIVED
      ? null
      : (statusChangedByAdminUserId ??
        (
          await prisma.adminUser.findFirst({
            where: { status: "ACTIVE" },
            select: { id: true },
          })
        )?.id);
  if (status !== PublicStorySubmissionStatus.RECEIVED && !statusActor) {
    throw new Error("C6B-6 fixture requires a status-change administrator.");
  }
  return prisma.publicStorySubmission.create({
    data: {
      submitterName: "C6B6 Confidential Submitter",
      submitterEmail: email,
      relationshipToHabitat: "Volunteer",
      suggestedTitle: "A suggested handoff title",
      storyText:
        "A confidential source story body that becomes private editorial source material.\n\nA second paragraph remains structured draft content.",
      contactConsent: true,
      privacyNoticeVersion: "public-story-v1",
      privacyNoticeAcceptedAt: new Date("2026-08-18T12:00:00.000Z"),
      editorialReviewAcknowledged: true,
      sensitiveDataWarningAcknowledged: true,
      publicationInterest: true,
      involvesMinor: true,
      involvesHomeownerOrApplicant: true,
      containsSensitivePersonalCircumstances: true,
      internalReviewNote:
        "Confidential review note must not cross the boundary.",
      status,
      ...(statusActor ? { statusChangedByAdminUserId: statusActor } : {}),
      version: 1,
      receivedAt: new Date("2026-08-18T12:00:00.000Z"),
      statusChangedAt: new Date("2026-08-18T12:01:00.000Z"),
    },
  });
}

beforeAll(async () => {
  await prisma.role.findUniqueOrThrow({
    where: { key: "communications-manager" },
  });
});

afterAll(async () => {
  const fixtures = await prisma.publicStorySubmission.findMany({
    where: { submitterName: "C6B6 Confidential Submitter" },
    select: { id: true },
  });
  if (fixtures.length) {
    await prisma.publicStorySubmissionStoryConversion.deleteMany({
      where: { submissionId: { in: fixtures.map(({ id }) => id) } },
    });
  }
  await prisma.$disconnect();
});

describe("C6B-6 Story conversion handoff PostgreSQL domain", () => {
  it("converts only accepted intake into an ordinary private draft with restricted provenance", async () => {
    const manager = await actor("communications-manager");
    const source = await submission();

    const result = await convertPublicStorySubmissionToStory(prisma, manager, {
      submissionId: source.id,
      expectedVersion: source.version,
    });

    expect(result).toMatchObject({
      created: true,
      submissionId: source.id,
      sourceSubmissionVersion: 1,
      convertedByAdminUserId: manager.adminUserId,
    });
    const story = await prisma.story.findUniqueOrThrow({
      where: { id: result.storyId },
      include: {
        publication: {
          include: {
            responsibility: true,
            currentRevision: true,
            approvedRevision: true,
            snapshots: true,
            publicProjection: true,
          },
        },
      },
    });
    expect(story.publication).toMatchObject({
      kind: "STORY",
      workflowState: "DRAFT",
      releaseState: "UNPUBLISHED",
      responsibility: { editorialOwnerAdminUserId: manager.adminUserId },
      approvedRevision: null,
      snapshots: [],
      publicProjection: null,
    });
    expect(story.publication.currentRevision).toMatchObject({
      headline: "A suggested handoff title",
      deck: null,
      excerpt: expect.stringContaining("A confidential source story body"),
    });
    expect(JSON.stringify(story.publication.currentRevision?.body)).toContain(
      "second paragraph remains structured draft content",
    );
    expect(
      JSON.stringify(story.publication.currentRevision?.body),
    ).not.toContain(source.submitterEmail);
    expect(
      JSON.stringify(story.publication.currentRevision?.body),
    ).not.toContain("Confidential review note");

    const provenance =
      await prisma.publicStorySubmissionStoryConversion.findUniqueOrThrow({
        where: { submissionId: source.id },
      });
    expect(provenance).toMatchObject({
      storyId: result.storyId,
      sourceSubmissionVersion: source.version,
      convertedByAdminUserId: manager.adminUserId,
    });
    expect(
      await prisma.publication.count({ where: { kind: "STORY" } }),
    ).toBeGreaterThan(0);
    expect(
      await prisma.auditEvent.count({
        where: {
          action: "public_story_submission.story_created",
          targetId: source.id,
        },
      }),
    ).toBe(1);
  });

  it("requires both review and Story-create capabilities and an active administrator", async () => {
    const manager = await actor("communications-manager");
    const contributor = await actor("contributor");
    const source = await submission();
    const reviewOnly: Actor = {
      adminUserId: manager.adminUserId,
      capabilities: [reviewCapability],
    };
    const storyOnly: Actor = {
      adminUserId: contributor.adminUserId,
      capabilities: [createCapability],
    };

    await expect(
      convertPublicStorySubmissionToStory(prisma, reviewOnly, {
        submissionId: source.id,
        expectedVersion: source.version,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      convertPublicStorySubmissionToStory(prisma, storyOnly, {
        submissionId: source.id,
        expectedVersion: source.version,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    await prisma.adminUser.update({
      where: { id: manager.adminUserId },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    });
    await expect(
      convertPublicStorySubmissionToStory(prisma, manager, {
        submissionId: source.id,
        expectedVersion: source.version,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await prisma.adminUser.update({
      where: { id: manager.adminUserId },
      data: { status: "ACTIVE", suspendedAt: null },
    });
  });

  it("rejects every non-accepted submission status without creating Story records", async () => {
    const manager = await actor("communications-manager");
    for (const status of [
      PublicStorySubmissionStatus.RECEIVED,
      PublicStorySubmissionStatus.IN_REVIEW,
      PublicStorySubmissionStatus.FOLLOW_UP,
      PublicStorySubmissionStatus.DECLINED,
      PublicStorySubmissionStatus.SPAM,
    ]) {
      const source = await submission(status);
      const before = await prisma.publication.count();
      await expect(
        convertPublicStorySubmissionToStory(prisma, manager, {
          submissionId: source.id,
          expectedVersion: source.version,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(
        await prisma.publicStorySubmissionStoryConversion.findUnique({
          where: { submissionId: source.id },
        }),
      ).toBeNull();
      expect(await prisma.publication.count()).toBe(before);
    }
  });

  it("enforces the expected source version and leaves the source unchanged", async () => {
    const manager = await actor("communications-manager");
    const source = await submission();
    const before = await prisma.publicStorySubmission.findUniqueOrThrow({
      where: { id: source.id },
    });

    await expect(
      convertPublicStorySubmissionToStory(prisma, manager, {
        submissionId: source.id,
        expectedVersion: source.version + 1,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    expect(await prisma.story.count()).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.publicStorySubmission.findUniqueOrThrow({
        where: { id: source.id },
      }),
    ).toMatchObject({
      status: before.status,
      version: before.version,
      storyText: before.storyText,
      internalReviewNote: before.internalReviewNote,
      submitterEmail: before.submitterEmail,
    });
  });

  it("is one-time and idempotent under repeated and concurrent requests", async () => {
    const manager = await actor("communications-manager");
    const source = await submission();
    const requests = Array.from({ length: 4 }, () =>
      convertPublicStorySubmissionToStory(prisma, manager, {
        submissionId: source.id,
        expectedVersion: source.version,
      }),
    );
    const results = await Promise.all(requests);
    expect(new Set(results.map(({ storyId }) => storyId)).size).toBe(1);
    expect(results.filter(({ created }) => created)).toHaveLength(1);
    expect(
      await prisma.publicStorySubmissionStoryConversion.count({
        where: { submissionId: source.id },
      }),
    ).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: {
          action: "public_story_submission.story_created",
          targetId: source.id,
        },
      }),
    ).toBe(1);

    const read = await getPublicStorySubmissionStoryConversion(
      prisma,
      { adminUserId: manager.adminUserId, capabilities: [reviewCapability] },
      source.id,
    );
    expect(read).toMatchObject({ converted: true, submissionId: source.id });
  });

  it("keeps the Story independent from later confidential source changes and retains the handoff record", async () => {
    const manager = await actor("communications-manager");
    const source = await submission();
    const result = await convertPublicStorySubmissionToStory(prisma, manager, {
      submissionId: source.id,
      expectedVersion: source.version,
    });
    const originalRevision = await prisma.publicationRevision.findFirstOrThrow({
      where: { publication: { story: { id: result.storyId } } },
    });

    await prisma.publicStorySubmission.update({
      where: { id: source.id },
      data: {
        storyText:
          "A later confidential source correction that remains retained in the submission record and is intentionally not synchronized into the already-created Story draft.",
        internalReviewNote: "A later private note.",
      },
    });
    const unchangedRevision =
      await prisma.publicationRevision.findUniqueOrThrow({
        where: { id: originalRevision.id },
      });
    expect(unchangedRevision.body).toEqual(originalRevision.body);
    expect(
      await prisma.publicStorySubmissionStoryConversion.findUnique({
        where: { submissionId: source.id },
      }),
    ).not.toBeNull();
  });
});
