import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PublicStorySubmissionMediaStatus } from "@/generated/prisma/client";
import { submitPublicStorySubmission } from "@/modules/communications/submissions/intake-service";
import { issuePublicStorySubmissionToken } from "@/modules/communications/submissions/intake-token";
import {
  createPublicStorySubmissionAttempt,
  issuePublicStorySubmissionMediaUpload,
} from "@/modules/communications/submissions/submission-media-service";
import type { PublicStoryIntakeConfig } from "@/modules/communications/submissions/intake-contract";

import { assertDestructiveTestDatabaseSafety } from "../support/destructive-test-database";

const testDatabase = assertDestructiveTestDatabaseSafety();
const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("@/generated/prisma/client");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabase.databaseUrl }),
});
const config: PublicStoryIntakeConfig = {
  enabled: true,
  secret: "c6b4a-form-integration-secret-at-least-32-bytes",
  privacyNoticeVersion: "public-story-v1",
  appOrigin: "http://127.0.0.1:3000",
  appEnv: "test",
  isVercel: false,
};
const limits = {
  network: { limit: 1000, windowMs: 60 * 60 * 1000 },
  email: { limit: 1000, windowMs: 24 * 60 * 60 * 1000 },
  global: { limit: 1000, windowMs: 60 * 60 * 1000 },
} as const;
const createdAt = new Date("2042-01-02T03:04:05.000Z");
let seededPublicationCount = 0;
let seededMediaAssetCount = 0;

function headers() {
  return {
    origin: config.appOrigin,
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "navigate",
    "content-type": "multipart/form-data; boundary=c6b4a",
  };
}

function form(token: string, overrides: Record<string, string> = {}) {
  const value = new FormData();
  for (const [key, entry] of Object.entries({
    formToken: token,
    honeypot: "",
    submitterName: "C6B4A submitter",
    submitterEmail: "c6b4a@example.org",
    relationshipToHabitat: "Volunteer",
    storyText:
      "This is a sufficiently long plain-text story for the public intake form integration boundary.",
    contactConsent: "true",
    privacyNoticeVersion: "public-story-v1",
    privacyNoticeAcknowledged: "true",
    editorialReviewAcknowledged: "true",
    sensitiveDataWarningAcknowledged: "true",
    ...overrides,
  }))
    value.set(key, entry);
  return value;
}

function tokenAt(now: Date) {
  return issuePublicStorySubmissionToken(
    {
      secret: config.secret!,
      privacyNoticeVersion: config.privacyNoticeVersion!,
    },
    new Date(now.valueOf() - 2_000),
  );
}

describe("C6B-4A public Share Your Story PostgreSQL boundary", () => {
  beforeAll(async () => {
    await prisma.publicStoryIntakeTokenUse.deleteMany();
    await prisma.publicStorySubmissionMedia.deleteMany();
    await prisma.publicStorySubmissionAttempt.deleteMany();
    await prisma.publicStorySubmission.deleteMany();
    seededPublicationCount = await prisma.publication.count();
    seededMediaAssetCount = await prisma.mediaAsset.count();
  });

  afterAll(async () => {
    await prisma.publicStorySubmissionMedia.deleteMany();
    await prisma.publicStorySubmissionAttempt.deleteMany();
    await prisma.publicStorySubmission.deleteMany();
    await prisma.publicStoryIntakeTokenUse.deleteMany();
    await prisma.$disconnect();
  });

  it("keeps a non-READY retained image from crossing the final submission gate", async () => {
    const attempt = await createPublicStorySubmissionAttempt(prisma, {
      now: () => createdAt,
    });
    const issued = await issuePublicStorySubmissionMediaUpload(
      prisma,
      {
        recoveryToken: attempt.recoveryToken,
        expectedAttemptVersion: attempt.version,
        declaredMimeType: "image/jpeg",
        originalFilename: "private.jpg",
        sensitivity: {
          involvesMinor: false,
          involvesHomeownerOrApplicant: false,
          involvesOtherIdentifiablePerson: false,
          depictsPrivateResidence: false,
          containsSensitivePersonalCircumstances: false,
        },
        uploadAuthorizationSecret: config.secret!,
      },
      { now: () => createdAt },
    );
    const submitAt = new Date(createdAt.valueOf() + 3_000);
    const first = await submitPublicStorySubmission(
      form(tokenAt(submitAt), {
        mediaRecoveryToken: attempt.recoveryToken,
        mediaAttemptVersion: String(issued.attemptVersion),
        rightsDeclarationAccepted: "true",
      }),
      { headers: headers() },
      {
        prisma,
        config,
        now: () => submitAt,
        cleanupArtifacts: false,
        rateLimits: limits,
        networkIdentity: "c6b4a-gate",
      },
    );
    expect(first.code).toBe("VALIDATION_FAILED");
    expect(await prisma.publicStorySubmission.count()).toBe(0);
    expect(await prisma.publicStoryIntakeTokenUse.count()).toBe(0);

    await prisma.publicStorySubmissionMedia.update({
      where: { id: issued.media.id },
      data: {
        technicalStatus: PublicStorySubmissionMediaStatus.READY,
        version: { increment: 1 },
      },
    });
    const readyVersion = issued.attemptVersion;
    const second = await submitPublicStorySubmission(
      form(tokenAt(submitAt), {
        mediaRecoveryToken: attempt.recoveryToken,
        mediaAttemptVersion: String(readyVersion),
        rightsDeclarationAccepted: "true",
      }),
      { headers: headers() },
      {
        prisma,
        config,
        now: () => submitAt,
        cleanupArtifacts: false,
        rateLimits: limits,
        networkIdentity: "c6b4a-gate-ready",
      },
    );
    expect(second.code).toBe("ACCEPTED");
    const submission = await prisma.publicStorySubmission.findFirstOrThrow();
    expect(
      await prisma.publicStorySubmissionMedia.findFirstOrThrow(),
    ).toMatchObject({ submissionId: submission.id, technicalStatus: "READY" });
    expect(
      await prisma.publicStorySubmissionAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      }),
    ).toMatchObject({ status: "SUBMITTED", submissionId: submission.id });
  });

  it("allows text-only intake without creating public Story, Publication, or MediaAsset records", async () => {
    const now = new Date(createdAt.valueOf() + 20_000);
    const result = await submitPublicStorySubmission(
      form(tokenAt(now), { submitterEmail: "text-only-c6b4a@example.org" }),
      { headers: headers() },
      {
        prisma,
        config,
        now: () => now,
        cleanupArtifacts: false,
        rateLimits: limits,
        networkIdentity: "c6b4a-text",
      },
    );
    expect(result.code).toBe("ACCEPTED");
    expect(await prisma.publicStorySubmission.count()).toBe(2);
    expect(await prisma.publication.count()).toBe(seededPublicationCount);
    expect(await prisma.mediaAsset.count()).toBe(seededMediaAssetCount);
  });
});
