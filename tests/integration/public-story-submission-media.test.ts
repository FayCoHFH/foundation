import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import sharp from "sharp";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PublicStorySubmissionAttemptStatus,
  PublicStorySubmissionMediaStatus,
} from "@/generated/prisma/client";
import {
  associateReadySubmissionMedia,
  cleanupExpiredPublicStorySubmissionAttempts,
  createPublicStorySubmissionAttempt,
  getPublicStorySubmissionAttemptRecovery,
  getPublicStorySubmissionMediaForAdministrativeReview,
  issuePublicStorySubmissionMediaUpload,
  processPublicStorySubmissionMedia,
  removePublicStorySubmissionMedia,
  reorderPublicStorySubmissionMedia,
  updatePublicStorySubmissionMediaMetadata,
  uploadPublicStorySubmissionMedia,
} from "@/modules/communications/submissions";
import { receivePublicStorySubmission } from "@/modules/communications/submissions/submission-service";
import type { Capability } from "@/platform/auth/capabilities";
import {
  createLocalSubmissionQuarantineStore,
  type SubmissionQuarantineStoragePort,
} from "@/platform/storage";
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
const uploadAuthorizationSecret = "c6b3a-test-upload-authority-secret-0001";
const sensitivity = {
  involvesMinor: false,
  involvesHomeownerOrApplicant: false,
  involvesOtherIdentifiablePerson: false,
  depictsPrivateResidence: false,
  containsSensitivePersonalCircumstances: false,
} as const;
type Actor = { adminUserId: string; capabilities: readonly Capability[] };

let rootDirectory: string;
let quarantine: ReturnType<typeof createLocalSubmissionQuarantineStore>;
let validJpeg: Uint8Array;

function now() {
  return new Date("2041-02-03T04:05:06.000Z");
}

async function createAttempt() {
  return createPublicStorySubmissionAttempt(prisma, { now });
}

async function issue(
  recoveryToken: string,
  expectedAttemptVersion: number,
  suffix: string = randomUUID(),
  declaredMimeType: "image/jpeg" | "image/png" = "image/jpeg",
) {
  return issuePublicStorySubmissionMediaUpload(
    prisma,
    {
      recoveryToken,
      expectedAttemptVersion,
      declaredMimeType,
      originalFilename: `confidential-${suffix}.${declaredMimeType === "image/png" ? "png" : "jpg"}`,
      description: "A confidential submitted image.",
      suggestedPhotoCredit: "A suggested credit",
      sensitivity,
      uploadAuthorizationSecret,
    },
    { now },
  );
}

async function upload(
  authorization: string,
  body: Uint8Array,
  declaredMimeType = "image/jpeg",
) {
  return uploadPublicStorySubmissionMedia(
    prisma,
    quarantine,
    {
      uploadAuthorization: authorization,
      uploadAuthorizationSecret,
      body,
      declaredMimeType,
    },
    { now },
  );
}

function submissionInput(submitterEmail = `media-${randomUUID()}@example.org`) {
  return {
    submitterName: "Media Submitter",
    submitterEmail,
    relationshipToHabitat: "Volunteer",
    suggestedTitle: "A submitted media story",
    storyText:
      "This is a sufficiently long confidential story for attaching submitted image records after processing.",
    contactConsent: true,
    privacyNoticeVersion: "public-story-v1",
    privacyNoticeAcceptedAt: now(),
    editorialReviewAcknowledged: true,
    sensitiveDataWarningAcknowledged: true,
    publicationInterest: true,
    ...sensitivity,
  } as const;
}

async function reviewActor(roleKey: string): Promise<Actor> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  const user = await prisma.user.create({
    data: {
      id: `c6b3a-${randomUUID()}`,
      name: "C6B3A reviewer",
      email: `c6b3a-${randomUUID()}@example.org`,
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

async function makeReady(attemptId: string, mediaId: string, version: number) {
  const result = await processPublicStorySubmissionMedia(
    prisma,
    quarantine,
    {
      attemptId,
      mediaId,
      expectedMediaVersion: version,
    },
    { now },
  );
  if (result.kind !== "ready") throw new Error("fixture processing failed");
  return result.media;
}

beforeAll(async () => {
  rootDirectory = await mkdtemp(join(tmpdir(), "habitat-c6b3a-quarantine-"));
  quarantine = createLocalSubmissionQuarantineStore({ rootDirectory, now });
  validJpeg = new Uint8Array(
    await sharp({
      create: {
        width: 8,
        height: 6,
        channels: 3,
        background: { r: 40, g: 80, b: 120 },
      },
    })
      .jpeg()
      .toBuffer(),
  );
  await prisma.publicStorySubmissionMedia.deleteMany();
  await prisma.publicStorySubmissionAttempt.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(rootDirectory, { recursive: true, force: true });
});

describe("C6B-3A private Story Submission media PostgreSQL domain", () => {
  it("creates an expiring opaque recovery attempt and keeps raw recovery material out of persistence", async () => {
    const attempt = await createAttempt();
    const row = await prisma.publicStorySubmissionAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(attempt.recoveryToken).not.toContain(attempt.id);
    expect(row.recoveryTokenHash).not.toContain(attempt.recoveryToken);
    expect(row.expiresAt).toEqual(
      new Date(now().getTime() + 24 * 60 * 60 * 1000),
    );
    const recovery = await getPublicStorySubmissionAttemptRecovery(
      prisma,
      attempt.recoveryToken,
    );
    expect(recovery).toMatchObject({
      attemptId: attempt.id,
      status: PublicStorySubmissionAttemptStatus.ACTIVE,
      media: [],
    });
  });

  it("binds one short-lived upload authorization to exactly one attempt and media slot", async () => {
    const attempt = await createAttempt();
    const issued = await issue(attempt.recoveryToken, attempt.version);
    expect(issued.uploadAuthorization).not.toContain(attempt.id);
    await expect(
      upload(issued.uploadAuthorization, new Uint8Array([1, 2, 3])),
    ).resolves.toMatchObject({ kind: "uploaded" });
    await expect(
      upload(issued.uploadAuthorization, new Uint8Array([1, 2, 3])),
    ).rejects.toBeInstanceOf(ValidationError);
    const row = await prisma.publicStorySubmissionMedia.findUniqueOrThrow({
      where: { id: issued.media.id },
    });
    expect(row.technicalStatus).toBe(PublicStorySubmissionMediaStatus.UPLOADED);
    expect(row.quarantineStorageKey).toMatch(/^submission-quarantine\//);
    expect(
      await quarantine.statForProcessing(row.quarantineStorageKey!),
    ).toMatchObject({
      byteSize: 3,
      classification: "CONFIDENTIAL",
    });
  });

  it("enforces item, per-file, aggregate, and attempt-scoped duplicate limits", async () => {
    const attempt = await createAttempt();
    let version = attempt.version;
    const issued = [] as Awaited<ReturnType<typeof issue>>[];
    for (let index = 0; index < 10; index += 1) {
      const item = await issue(attempt.recoveryToken, version, `item-${index}`);
      issued.push(item);
      version = item.attemptVersion;
    }
    await expect(issue(attempt.recoveryToken, version)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      upload(
        issued[0]!.uploadAuthorization,
        new Uint8Array(10 * 1024 * 1024 + 1),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const first = await upload(
      issued[1]!.uploadAuthorization,
      new Uint8Array([4, 5, 6]),
    );
    expect(first).toMatchObject({ kind: "uploaded" });
    const duplicate = await upload(
      issued[2]!.uploadAuthorization,
      new Uint8Array([4, 5, 6]),
    );
    expect(duplicate).toEqual({ kind: "rejected", reason: "DUPLICATE_IMAGE" });

    await prisma.publicStorySubmissionMedia.updateMany({
      where: {
        attemptId: attempt.id,
        technicalStatus: "PENDING_UPLOAD",
        id: {
          notIn: [
            issued[0]!.media.id,
            issued[1]!.media.id,
            issued[2]!.media.id,
            issued[3]!.media.id,
          ],
        },
      },
      data: { technicalStatus: "UPLOADED", originalByteSize: 60 * 1024 * 1024 },
    });
    const aggregate = await upload(
      issued[3]!.uploadAuthorization,
      new Uint8Array([7]),
    );
    expect(aggregate).toEqual({
      kind: "rejected",
      reason: "SUBMISSION_TOTAL_TOO_LARGE",
    });
    const media = await prisma.publicStorySubmissionMedia.findMany({
      where: { attemptId: attempt.id },
      orderBy: { ordinal: "asc" },
    });
    expect(
      media.filter((item) => item.technicalStatus !== "REJECTED"),
    ).toHaveLength(7);
    expect(
      media.filter((item) => item.technicalStatus === "REJECTED"),
    ).toHaveLength(3);
  });

  it("compacts order, preserves its first retained item as lead, and removes binaries server-side", async () => {
    const attempt = await createAttempt();
    const first = await issue(attempt.recoveryToken, attempt.version, "first");
    const second = await issue(
      attempt.recoveryToken,
      first.attemptVersion,
      "second",
    );
    const firstUploaded = await upload(
      first.uploadAuthorization,
      new Uint8Array([11]),
    );
    const secondUploaded = await upload(
      second.uploadAuthorization,
      new Uint8Array([12]),
    );
    if (firstUploaded.kind !== "uploaded" || secondUploaded.kind !== "uploaded")
      throw new Error("fixture upload failed");
    const reordered = await reorderPublicStorySubmissionMedia(
      prisma,
      {
        recoveryToken: attempt.recoveryToken,
        expectedAttemptVersion: second.attemptVersion,
        mediaIds: [second.media.id, first.media.id],
      },
      { now },
    );
    expect(reordered.media.map((item) => item.id)).toEqual([
      second.media.id,
      first.media.id,
    ]);
    await removePublicStorySubmissionMedia(
      prisma,
      quarantine,
      {
        recoveryToken: attempt.recoveryToken,
        mediaId: second.media.id,
        expectedMediaVersion: secondUploaded.media.version,
      },
      { now },
    );
    const recovery = await getPublicStorySubmissionAttemptRecovery(
      prisma,
      attempt.recoveryToken,
    );
    expect(
      recovery.media.find((item) => item.id === first.media.id)?.ordinal,
    ).toBe(1);
    expect(
      recovery.media.find((item) => item.id === second.media.id),
    ).toMatchObject({
      ordinal: null,
      technicalStatus: "REMOVED",
    });
    const removed = await prisma.publicStorySubmissionMedia.findUniqueOrThrow({
      where: { id: second.media.id },
    });
    expect(
      await quarantine.statForProcessing(removed.quarantineStorageKey!),
    ).toBeNull();
    expect(removed.binaryDeletedAt).not.toBeNull();
  });

  it("only atomically attaches Ready retained media and closes the attempt on submission", async () => {
    const attempt = await createAttempt();
    const issued = await issue(attempt.recoveryToken, attempt.version);
    const uploaded = await upload(issued.uploadAuthorization, validJpeg);
    if (uploaded.kind !== "uploaded") throw new Error("fixture upload failed");
    const submitterEmail = `association-${randomUUID()}@example.org`;
    await receivePublicStorySubmission(
      prisma,
      submissionInput(submitterEmail),
      { now },
    );
    const submission = await prisma.publicStorySubmission.findFirstOrThrow({
      where: { submitterEmail },
    });
    await expect(
      associateReadySubmissionMedia(
        prisma,
        {
          recoveryToken: attempt.recoveryToken,
          expectedAttemptVersion: issued.attemptVersion,
          submissionId: submission.id,
        },
        { now },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    const ready = await makeReady(
      attempt.id,
      issued.media.id,
      uploaded.media.version,
    );
    const attached = await associateReadySubmissionMedia(
      prisma,
      {
        recoveryToken: attempt.recoveryToken,
        expectedAttemptVersion: issued.attemptVersion,
        submissionId: submission.id,
      },
      { now },
    );
    expect(attached).toMatchObject({
      mediaCount: 1,
      submissionId: submission.id,
    });
    expect(ready.technicalStatus).toBe("READY");
    await expect(
      updatePublicStorySubmissionMediaMetadata(
        prisma,
        {
          recoveryToken: attempt.recoveryToken,
          mediaId: issued.media.id,
          expectedMediaVersion: ready.version,
          sensitivity,
        },
        { now },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    const row = await prisma.publicStorySubmissionAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(row.status).toBe("SUBMITTED");
  });

  it("provides a constrained administrative DTO and no raw storage or authorization material", async () => {
    const attempt = await createAttempt();
    const issued = await issue(attempt.recoveryToken, attempt.version);
    const uploaded = await upload(issued.uploadAuthorization, validJpeg);
    if (uploaded.kind !== "uploaded") throw new Error("fixture upload failed");
    const ready = await makeReady(
      attempt.id,
      issued.media.id,
      uploaded.media.version,
    );
    const submitterEmail = `review-${randomUUID()}@example.org`;
    await receivePublicStorySubmission(
      prisma,
      submissionInput(submitterEmail),
      { now },
    );
    const submission = await prisma.publicStorySubmission.findFirstOrThrow({
      where: { submitterEmail },
    });
    await associateReadySubmissionMedia(
      prisma,
      {
        recoveryToken: attempt.recoveryToken,
        expectedAttemptVersion: issued.attemptVersion,
        submissionId: submission.id,
      },
      { now },
    );
    const reviewer = await reviewActor("communications-manager");
    const dto = await getPublicStorySubmissionMediaForAdministrativeReview(
      prisma,
      reviewer,
      submission.id,
    );
    expect(dto).toHaveLength(1);
    expect(dto[0]).not.toHaveProperty("quarantineStorageKey");
    expect(dto[0]).not.toHaveProperty("originalSha256");
    expect(dto[0]).not.toHaveProperty("uploadAuthorizationNonceHash");
    await expect(
      getPublicStorySubmissionMediaForAdministrativeReview(
        prisma,
        { adminUserId: reviewer.adminUserId, capabilities: [] },
        submission.id,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(ready.technicalStatus).toBe("READY");
  });

  it("expires only unsubmitted attempts in bounded cleanup and retains submitted media", async () => {
    const expired = await createAttempt();
    const issued = await issue(expired.recoveryToken, expired.version);
    const uploaded = await upload(issued.uploadAuthorization, validJpeg);
    if (uploaded.kind !== "uploaded") throw new Error("fixture upload failed");
    const ready = await makeReady(
      expired.id,
      issued.media.id,
      uploaded.media.version,
    );
    const beforeExpiry =
      await prisma.publicStorySubmissionMedia.findUniqueOrThrow({
        where: { id: issued.media.id },
      });
    await prisma.publicStorySubmissionAttempt.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(now().getTime() - 1) },
    });
    const result = await cleanupExpiredPublicStorySubmissionAttempts(
      prisma,
      quarantine,
      {
        now: now(),
        limit: 1,
      },
    );
    expect(result).toEqual({ attemptsProcessed: 1 });
    const row = await prisma.publicStorySubmissionAttempt.findUniqueOrThrow({
      where: { id: expired.id },
    });
    expect(row.status).toBe("EXPIRED");
    const media = await prisma.publicStorySubmissionMedia.findUniqueOrThrow({
      where: { id: issued.media.id },
    });
    expect(media.technicalStatus).toBe("REMOVED");
    expect(
      await quarantine.statForProcessing(media.quarantineStorageKey!),
    ).toBeNull();
    expect(
      await quarantine.statForProcessing(
        beforeExpiry.reviewDerivativeStorageKey!,
      ),
    ).toBeNull();
    expect(ready.technicalStatus).toBe("READY");
  });

  it("rejects stale concurrent slot issuance instead of allowing an eleventh retained slot", async () => {
    const attempt = await createAttempt();
    let version = attempt.version;
    for (let index = 0; index < 9; index += 1) {
      version = (await issue(attempt.recoveryToken, version, `race-${index}`))
        .attemptVersion;
    }
    const raced = await Promise.allSettled([
      issue(attempt.recoveryToken, version, "race-a"),
      issue(attempt.recoveryToken, version, "race-b"),
    ]);
    expect(
      raced.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      raced.find((result) => result.status === "rejected")?.reason,
    ).toBeInstanceOf(ConcurrencyError);
    await expect(
      prisma.publicStorySubmissionMedia.count({
        where: {
          attemptId: attempt.id,
          technicalStatus: { notIn: ["REJECTED", "REMOVED"] },
        },
      }),
    ).resolves.toBe(10);
  });

  it("creates one confidential derivative, retains its original privately, and deletes both on removal", async () => {
    const attempt = await createAttempt();
    const issued = await issue(attempt.recoveryToken, attempt.version, "ready");
    const uploaded = await upload(issued.uploadAuthorization, validJpeg);
    if (uploaded.kind !== "uploaded") throw new Error("fixture upload failed");

    const processed = await processPublicStorySubmissionMedia(
      prisma,
      quarantine,
      {
        attemptId: attempt.id,
        mediaId: issued.media.id,
        expectedMediaVersion: uploaded.media.version,
      },
      { now },
    );
    expect(processed).toMatchObject({ kind: "ready" });
    const row = await prisma.publicStorySubmissionMedia.findUniqueOrThrow({
      where: { id: issued.media.id },
    });
    expect(row).toMatchObject({
      technicalStatus: "READY",
      detectedFormat: "JPEG",
      sourceWidth: 8,
      sourceHeight: 6,
      reviewDerivativeFormat: "JPEG",
      reviewDerivativeWidth: 8,
      reviewDerivativeHeight: 6,
    });
    expect(row.reviewDerivativeStorageKey).toMatch(
      /^submission-review-derivative\//,
    );
    expect(
      await quarantine.statForProcessing(row.quarantineStorageKey!),
    ).not.toBeNull();
    expect(
      await quarantine.statForProcessing(row.reviewDerivativeStorageKey!),
    ).toMatchObject({
      classification: "CONFIDENTIAL",
      contentType: "image/jpeg",
    });
    const recovery = await getPublicStorySubmissionAttemptRecovery(
      prisma,
      attempt.recoveryToken,
    );
    expect(recovery.media[0]).not.toHaveProperty("reviewDerivativeStorageKey");
    if (processed.kind !== "ready")
      throw new Error("fixture processing failed");
    await removePublicStorySubmissionMedia(
      prisma,
      quarantine,
      {
        recoveryToken: attempt.recoveryToken,
        mediaId: issued.media.id,
        expectedMediaVersion: processed.media.version,
      },
      { now },
    );
    expect(
      await quarantine.statForProcessing(row.quarantineStorageKey!),
    ).toBeNull();
    expect(
      await quarantine.statForProcessing(row.reviewDerivativeStorageKey!),
    ).toBeNull();
  });

  it("permanently rejects signature mismatch and restores UPLOADED only for a transient storage failure", async () => {
    const mismatchAttempt = await createAttempt();
    const mismatch = await issue(
      mismatchAttempt.recoveryToken,
      mismatchAttempt.version,
      "mismatch",
      "image/png",
    );
    const mismatchedUpload = await upload(
      mismatch.uploadAuthorization,
      validJpeg,
      "image/png",
    );
    if (mismatchedUpload.kind !== "uploaded")
      throw new Error("fixture upload failed");
    await expect(
      processPublicStorySubmissionMedia(
        prisma,
        quarantine,
        {
          attemptId: mismatchAttempt.id,
          mediaId: mismatch.media.id,
          expectedMediaVersion: mismatchedUpload.media.version,
        },
        { now },
      ),
    ).resolves.toEqual({ kind: "rejected", reason: "MIME_TYPE_MISMATCH" });
    const rejected = await prisma.publicStorySubmissionMedia.findUniqueOrThrow({
      where: { id: mismatch.media.id },
    });
    expect(rejected).toMatchObject({
      technicalStatus: "REJECTED",
      rejectionReason: "MIME_TYPE_MISMATCH",
      binaryDeletedAt: now(),
    });
    expect(
      await quarantine.statForProcessing(rejected.quarantineStorageKey!),
    ).toBeNull();

    const transientAttempt = await createAttempt();
    const transient = await issue(
      transientAttempt.recoveryToken,
      transientAttempt.version,
      "transient",
    );
    const transientUpload = await upload(
      transient.uploadAuthorization,
      validJpeg,
    );
    if (transientUpload.kind !== "uploaded")
      throw new Error("fixture upload failed");
    const unavailableStorage: SubmissionQuarantineStoragePort = {
      put: (input) => quarantine.put(input),
      putReviewDerivative: (input) => quarantine.putReviewDerivative(input),
      readForProcessing: async () => {
        throw new Error("temporary storage outage");
      },
      statForProcessing: (key) => quarantine.statForProcessing(key),
      deleteForCleanup: (key) => quarantine.deleteForCleanup(key),
    };
    await expect(
      processPublicStorySubmissionMedia(
        prisma,
        unavailableStorage,
        {
          attemptId: transientAttempt.id,
          mediaId: transient.media.id,
          expectedMediaVersion: transientUpload.media.version,
        },
        { now },
      ),
    ).resolves.toMatchObject({ kind: "retryable" });
    await expect(
      prisma.publicStorySubmissionMedia.findUniqueOrThrow({
        where: { id: transient.media.id },
      }),
    ).resolves.toMatchObject({ technicalStatus: "UPLOADED" });
  });

  it("allows exactly one processor to claim an uploaded original", async () => {
    const attempt = await createAttempt();
    const issued = await issue(attempt.recoveryToken, attempt.version, "race");
    const uploaded = await upload(issued.uploadAuthorization, validJpeg);
    if (uploaded.kind !== "uploaded") throw new Error("fixture upload failed");
    const outcomes = await Promise.allSettled([
      processPublicStorySubmissionMedia(
        prisma,
        quarantine,
        {
          attemptId: attempt.id,
          mediaId: issued.media.id,
          expectedMediaVersion: uploaded.media.version,
        },
        { now },
      ),
      processPublicStorySubmissionMedia(
        prisma,
        quarantine,
        {
          attemptId: attempt.id,
          mediaId: issued.media.id,
          expectedMediaVersion: uploaded.media.version,
        },
        { now },
      ),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.find((outcome) => outcome.status === "rejected")?.reason,
    ).toBeInstanceOf(ConcurrencyError);
    await expect(
      prisma.publicStorySubmissionMedia.findUniqueOrThrow({
        where: { id: issued.media.id },
      }),
    ).resolves.toMatchObject({ technicalStatus: "READY" });
  });

  it("keeps duplicate, order/removal, and final association races within one attempt boundary", async () => {
    const duplicateAttempt = await createAttempt();
    const duplicateFirst = await issue(
      duplicateAttempt.recoveryToken,
      duplicateAttempt.version,
      "duplicate-first",
    );
    const duplicateSecond = await issue(
      duplicateAttempt.recoveryToken,
      duplicateFirst.attemptVersion,
      "duplicate-second",
    );
    await Promise.allSettled([
      upload(duplicateFirst.uploadAuthorization, new Uint8Array([51, 52])),
      upload(duplicateSecond.uploadAuthorization, new Uint8Array([51, 52])),
    ]);
    expect(
      await prisma.publicStorySubmissionMedia.count({
        where: {
          attemptId: duplicateAttempt.id,
          technicalStatus: "UPLOADED",
          originalSha256: {
            not: null,
          },
        },
      }),
    ).toBeLessThanOrEqual(1);

    const orderAttempt = await createAttempt();
    const first = await issue(
      orderAttempt.recoveryToken,
      orderAttempt.version,
      "order-first",
    );
    const second = await issue(
      orderAttempt.recoveryToken,
      first.attemptVersion,
      "order-second",
    );
    const firstUploaded = await upload(
      first.uploadAuthorization,
      new Uint8Array([61]),
    );
    const secondUploaded = await upload(
      second.uploadAuthorization,
      new Uint8Array([62]),
    );
    if (firstUploaded.kind !== "uploaded" || secondUploaded.kind !== "uploaded")
      throw new Error("fixture upload failed");
    await Promise.allSettled([
      reorderPublicStorySubmissionMedia(
        prisma,
        {
          recoveryToken: orderAttempt.recoveryToken,
          expectedAttemptVersion: second.attemptVersion,
          mediaIds: [second.media.id, first.media.id],
        },
        { now },
      ),
      removePublicStorySubmissionMedia(
        prisma,
        quarantine,
        {
          recoveryToken: orderAttempt.recoveryToken,
          mediaId: second.media.id,
          expectedMediaVersion: secondUploaded.media.version,
        },
        { now },
      ),
    ]);
    const retained = await prisma.publicStorySubmissionMedia.findMany({
      where: {
        attemptId: orderAttempt.id,
        technicalStatus: { notIn: ["REJECTED", "REMOVED"] },
      },
      orderBy: { ordinal: "asc" },
    });
    expect(retained.map((item) => item.ordinal)).toEqual(
      retained.map((_, index) => index + 1),
    );

    const finalAttempt = await createAttempt();
    const finalIssued = await issue(
      finalAttempt.recoveryToken,
      finalAttempt.version,
      "final",
    );
    const finalUploaded = await upload(
      finalIssued.uploadAuthorization,
      validJpeg,
    );
    if (finalUploaded.kind !== "uploaded")
      throw new Error("fixture upload failed");
    await makeReady(
      finalAttempt.id,
      finalIssued.media.id,
      finalUploaded.media.version,
    );
    const emailA = `final-a-${randomUUID()}@example.org`;
    const emailB = `final-b-${randomUUID()}@example.org`;
    await receivePublicStorySubmission(prisma, submissionInput(emailA), {
      now,
    });
    await receivePublicStorySubmission(prisma, submissionInput(emailB), {
      now,
    });
    const [submissionA, submissionB] =
      await prisma.publicStorySubmission.findMany({
        where: { submitterEmail: { in: [emailA, emailB] } },
        select: { id: true },
      });
    const finalizations = await Promise.allSettled([
      associateReadySubmissionMedia(
        prisma,
        {
          recoveryToken: finalAttempt.recoveryToken,
          expectedAttemptVersion: finalIssued.attemptVersion,
          submissionId: submissionA!.id,
        },
        { now },
      ),
      associateReadySubmissionMedia(
        prisma,
        {
          recoveryToken: finalAttempt.recoveryToken,
          expectedAttemptVersion: finalIssued.attemptVersion,
          submissionId: submissionB!.id,
        },
        { now },
      ),
    ]);
    expect(
      finalizations.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const finalRow =
      await prisma.publicStorySubmissionAttempt.findUniqueOrThrow({
        where: { id: finalAttempt.id },
      });
    expect(finalRow.status).toBe("SUBMITTED");
    expect([submissionA!.id, submissionB!.id]).toContain(finalRow.submissionId);
  });
});
