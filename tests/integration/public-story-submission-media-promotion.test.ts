import { mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  MediaAssetCreditTreatment,
  PublicStorySubmissionMediaClearanceType,
  PublicStorySubmissionMediaEvidenceType,
  PublicStorySubmissionMediaStatus,
  PublicStorySubmissionMediaUse,
} from "@/generated/prisma/client";
import {
  createPublicMediaUsage,
  evaluatePublicMediaAssetEligibility,
  getPublicMediaAssetForPublicRead,
  listExistingPublicMediaUsesForReview,
  promotePublicStorySubmissionMediaToLibrary,
  createPublicStorySubmissionMediaClearance,
  receivePublicStorySubmission,
  verifyPublicStorySubmissionMediaClearance,
  restrictPublicStorySubmissionMedia,
  restorePublicStorySubmissionMediaEligibility,
} from "@/modules/communications/submissions";
import type { Capability } from "@/platform/auth/capabilities";
import {
  createLocalObjectStores,
  createLocalSubmissionQuarantineStore,
} from "@/platform/storage";
import {
  ConcurrencyError,
  PreconditionError,
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
const fixedNow = new Date("2043-03-04T05:06:07.000Z");
let root: string;
let privateStore: ReturnType<typeof createLocalSubmissionQuarantineStore>;
let publicStore: ReturnType<typeof createLocalObjectStores>["publicStore"];
const derivativeBody = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

async function actor(roleKey: string): Promise<Actor> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  const user = await prisma.user.create({
    data: {
      id: `c6b3e-${randomUUID()}`,
      name: `C6B3E ${role.name}`,
      email: `c6b3e-${randomUUID()}@example.org`,
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

async function fixture(reviewer: Actor) {
  const received = await receivePublicStorySubmission(
    prisma,
    {
      submitterName: "Private submitter",
      submitterEmail: `c6b3e-${randomUUID()}@example.org`,
      relationshipToHabitat: "Volunteer",
      storyText:
        "A confidential story long enough for promotion integration testing.",
      contactConsent: true,
      privacyNoticeVersion: "privacy-v1",
      privacyNoticeAcceptedAt: fixedNow,
      editorialReviewAcknowledged: true,
      sensitiveDataWarningAcknowledged: true,
    },
    { now: () => fixedNow },
  );
  const submission = await prisma.publicStorySubmission.findFirstOrThrow({
    where: { receivedAt: fixedNow },
    orderBy: { createdAt: "desc" },
  });
  const attempt = await prisma.publicStorySubmissionAttempt.create({
    data: {
      recoveryTokenHash: randomUUID().replaceAll("-", ""),
      status: "SUBMITTED",
      expiresAt: new Date(fixedNow.getTime() + 86_400_000),
      submissionId: submission.id,
    },
  });
  const media = await prisma.publicStorySubmissionMedia.create({
    data: {
      attemptId: attempt.id,
      submissionId: submission.id,
      ordinal: 0,
      originalFilename: "private-original.jpg",
      declaredMimeType: "image/jpeg",
      originalByteSize: 999,
      suggestedPhotoCredit: "Do not copy this suggestion",
      uploadAuthorizationNonceHash: randomUUID().replaceAll("-", ""),
      technicalStatus: PublicStorySubmissionMediaStatus.READY,
      processedAt: fixedNow,
      reviewDerivativeStorageKey: `submission-review-derivative/${randomUUID().replaceAll("-", "")}`,
      reviewDerivativeFormat: "JPEG",
      reviewDerivativeWidth: 2,
      reviewDerivativeHeight: 2,
      reviewDerivativeByteSize: derivativeBody.byteLength,
    },
  });
  const source = await prisma.publicStorySubmissionMedia.findUniqueOrThrow({
    where: { id: media.id },
  });
  await privateStore.putReviewDerivative({
    key: source.reviewDerivativeStorageKey!,
    body: derivativeBody,
    contentType: "image/jpeg",
    classification: "CONFIDENTIAL",
  });
  const clearance = await createPublicStorySubmissionMediaClearance(
    prisma,
    reviewer,
    {
      submissionId: submission.id,
      clearanceType: PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
      mediaIds: [media.id],
      dateObtained: fixedNow,
      evidenceType: PublicStorySubmissionMediaEvidenceType.NEW_RELEASE,
      websitePublicationAllowed: true,
      socialMediaAllowed: false,
      printAllowed: false,
      fundraisingPromotionalAllowed: false,
      paidAdvertisingAllowed: false,
    },
    { now: () => fixedNow },
  );
  await verifyPublicStorySubmissionMediaClearance(
    prisma,
    reviewer,
    {
      clearanceId: clearance.id,
      expectedClearanceVersion: clearance.version,
      dateObtained: fixedNow,
    },
    { now: () => fixedNow },
  );
  return {
    submissionId: submission.id,
    mediaId: media.id,
    mediaVersion: media.version,
    clearanceId: clearance.id,
    received,
  };
}

beforeAll(async () => {
  root = await mkdtemp(join("/tmp", "habitat-c6b3e-"));
  privateStore = createLocalSubmissionQuarantineStore({
    rootDirectory: join(root, "private"),
    now: () => fixedNow,
  });
  publicStore = createLocalObjectStores({
    publicRootDirectory: join(root, "public"),
    privateRootDirectory: join(root, "unused"),
    privateGrantSigningSecret: "c6b3e-local-grant-secret-0123456789012345",
    now: () => fixedNow,
  }).publicStore;
});

beforeEach(async () => {
  await prisma.mediaUsage.deleteMany();
  await prisma.publicStorySubmissionMediaPromotionClearance.deleteMany();
  await prisma.publicStorySubmissionMediaPromotion.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.publicStorySubmission.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(root, { recursive: true, force: true });
});

describe("C6B-3E public Media Library promotion and rights integration", () => {
  it("promotes only the sanitized derivative, records provenance/clearance history, and creates no usage", async () => {
    const reviewer = await actor("communications-manager");
    const item = await fixture(reviewer);
    const result = await promotePublicStorySubmissionMediaToLibrary(
      prisma,
      reviewer,
      privateStore,
      publicStore,
      {
        mediaId: item.mediaId,
        expectedMediaVersion: item.mediaVersion,
        creditTreatment: MediaAssetCreditTreatment.VERIFIED_CREDIT,
        publicCredit: "Verified Habitat photographer",
      },
      { now: () => fixedNow },
    );
    expect(result.duplicate).toBe(false);
    const asset = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id: result.asset.id },
      include: { promotion: { include: { clearanceSnapshots: true } } },
    });
    expect(asset.publicStorageKey).not.toContain(
      "submission-review-derivative",
    );
    expect(asset.promotion?.sourceMediaId).toBe(item.mediaId);
    expect(asset.promotion?.sourceSubmissionId).toBe(item.submissionId);
    expect(asset.promotion?.clearanceSnapshots).toHaveLength(1);
    expect(asset.promotion?.publicCredit).toBe("Verified Habitat photographer");
    expect(asset.promotion?.creditTreatment).toBe(
      MediaAssetCreditTreatment.VERIFIED_CREDIT,
    );
    expect(await prisma.mediaUsage.count()).toBe(0);
    expect(
      await getPublicMediaAssetForPublicRead(prisma, asset.id, fixedNow),
    ).toMatchObject({
      id: asset.id,
      publicCredit: "Verified Habitat photographer",
    });
  });

  it("fails closed for unresolved credit, rejects unauthorized promotion, and is retry-safe", async () => {
    const reviewer = await actor("communications-manager");
    const denied = await actor("editor");
    const item = await fixture(reviewer);
    await expect(
      promotePublicStorySubmissionMediaToLibrary(
        prisma,
        denied,
        privateStore,
        publicStore,
        {
          mediaId: item.mediaId,
          expectedMediaVersion: item.mediaVersion,
          creditTreatment: MediaAssetCreditTreatment.NO_PUBLIC_CREDIT,
        },
      ),
    ).rejects.toThrow();
    await expect(
      promotePublicStorySubmissionMediaToLibrary(
        prisma,
        reviewer,
        privateStore,
        publicStore,
        {
          mediaId: item.mediaId,
          expectedMediaVersion: item.mediaVersion,
          creditTreatment: MediaAssetCreditTreatment.VERIFIED_CREDIT,
        },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    const first = await promotePublicStorySubmissionMediaToLibrary(
      prisma,
      reviewer,
      privateStore,
      publicStore,
      {
        mediaId: item.mediaId,
        expectedMediaVersion: item.mediaVersion,
        creditTreatment: MediaAssetCreditTreatment.NO_PUBLIC_CREDIT,
      },
    );
    const retry = await promotePublicStorySubmissionMediaToLibrary(
      prisma,
      reviewer,
      privateStore,
      publicStore,
      {
        mediaId: item.mediaId,
        expectedMediaVersion: item.mediaVersion,
        creditTreatment: MediaAssetCreditTreatment.NO_PUBLIC_CREDIT,
      },
    );
    expect(first.asset.id).toBe(retry.asset.id);
    expect(retry.duplicate).toBe(true);
  });

  it("derives restriction state, blocks new uses, surfaces existing uses, and restores only through the existing high-authority path", async () => {
    const reviewer = await actor("communications-manager");
    const superAdmin = await actor("super-admin");
    const item = await fixture(reviewer);
    const promoted = await promotePublicStorySubmissionMediaToLibrary(
      prisma,
      reviewer,
      privateStore,
      publicStore,
      {
        mediaId: item.mediaId,
        expectedMediaVersion: item.mediaVersion,
        creditTreatment: MediaAssetCreditTreatment.ORGANIZATIONAL_CREDIT,
        publicCredit: "Fayette County Habitat for Humanity",
      },
    );
    await createPublicMediaUsage(prisma, reviewer, {
      mediaAssetId: promoted.asset.id,
      usageType: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
      subjectType: "STORY_REVISION",
      subjectId: randomUUID(),
    });
    await restrictPublicStorySubmissionMedia(
      prisma,
      reviewer,
      {
        mediaId: item.mediaId,
        reason: "PRIVACY_CONCERN",
        expectedRestrictionVersion: null,
      },
      { now: () => fixedNow },
    );
    await expect(
      createPublicMediaUsage(prisma, reviewer, {
        mediaAssetId: promoted.asset.id,
        usageType: PublicStorySubmissionMediaUse.SOCIAL_MEDIA,
        subjectType: "STORY_REVISION",
        subjectId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(PreconditionError);
    expect(
      (
        await evaluatePublicMediaAssetEligibility(prisma, {
          mediaAssetId: promoted.asset.id,
          proposedUse: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
          now: fixedNow,
        })
      ).eligible,
    ).toBe(false);
    expect(
      await listExistingPublicMediaUsesForReview(
        prisma,
        reviewer,
        promoted.asset.id,
      ),
    ).toHaveLength(1);
    await restorePublicStorySubmissionMediaEligibility(
      prisma,
      superAdmin,
      {
        mediaId: item.mediaId,
        proposedUse: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
        expectedRestrictionVersion: 1,
      },
      { now: () => fixedNow },
    );
    expect(
      (
        await evaluatePublicMediaAssetEligibility(prisma, {
          mediaAssetId: promoted.asset.id,
          proposedUse: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
          now: fixedNow,
        })
      ).eligible,
    ).toBe(true);
  });

  it("compensates a public object when the transactional audit write fails", async () => {
    const reviewer = await actor("communications-manager");
    const item = await fixture(reviewer);
    await expect(
      promotePublicStorySubmissionMediaToLibrary(
        prisma,
        reviewer,
        privateStore,
        publicStore,
        {
          mediaId: item.mediaId,
          expectedMediaVersion: item.mediaVersion,
          creditTreatment: MediaAssetCreditTreatment.NO_PUBLIC_CREDIT,
        },
        {
          auditWriter: async () => {
            throw new Error("audit unavailable");
          },
          now: () => fixedNow,
        },
      ),
    ).rejects.toThrow("audit unavailable");
    expect(await prisma.mediaAsset.count()).toBe(0);
    const files = await publicStore.head("media-library/missing");
    expect(files).toBeNull();
  });

  it("allows exactly one canonical promotion under concurrent attempts", async () => {
    const reviewer = await actor("communications-manager");
    const item = await fixture(reviewer);
    const input = {
      mediaId: item.mediaId,
      expectedMediaVersion: item.mediaVersion,
      creditTreatment: MediaAssetCreditTreatment.NO_PUBLIC_CREDIT,
    } as const;
    const results = await Promise.allSettled([
      promotePublicStorySubmissionMediaToLibrary(
        prisma,
        reviewer,
        privateStore,
        publicStore,
        input,
      ),
      promotePublicStorySubmissionMediaToLibrary(
        prisma,
        reviewer,
        privateStore,
        publicStore,
        input,
      ),
    ]);
    const fulfilled = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof promotePublicStorySubmissionMediaToLibrary>>
      > => result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0]?.reason).toBeInstanceOf(ConcurrencyError);
    expect(
      await prisma.publicStorySubmissionMediaPromotion.count({
        where: { sourceMediaId: item.mediaId },
      }),
    ).toBe(1);
    expect(await prisma.mediaAsset.count()).toBe(1);
  });
});
