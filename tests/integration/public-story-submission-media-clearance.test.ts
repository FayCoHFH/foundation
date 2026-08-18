import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  PublicStorySubmissionMediaClearanceType,
  PublicStorySubmissionMediaEvidenceType,
  PublicStorySubmissionMediaStatus,
  PublicStorySubmissionMediaSubjectType,
  PublicStorySubmissionMediaUse,
} from "@/generated/prisma/client";
import {
  createPublicStorySubmissionMediaClearance,
  createPublicStorySubmissionMediaSubject,
  evaluatePublicStorySubmissionMediaEligibility,
  listPublicStorySubmissionMediaClearancesForReview,
  recordPublicStorySubmissionRightsDeclaration,
  recordPublicStorySubmissionMediaRevocationRequest,
  rejectPublicStorySubmissionMediaClearance,
  restorePublicStorySubmissionMediaEligibility,
  restrictPublicStorySubmissionMedia,
  revokePublicStorySubmissionMediaClearance,
  setPublicStorySubmissionMediaClearanceApplicability,
  verifyPublicStorySubmissionMediaClearance,
} from "@/modules/communications/submissions";
import { receivePublicStorySubmission } from "@/modules/communications/submissions/submission-service";
import type { Capability } from "@/platform/auth/capabilities";
import {
  AuthorizationError,
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
const fixedNow = new Date("2042-03-04T05:06:07.000Z");

async function actor(roleKey: string): Promise<Actor> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  const user = await prisma.user.create({
    data: {
      id: `c6b3c-${randomUUID()}`,
      name: `C6B3C ${role.name}`,
      email: `c6b3c-${randomUUID()}@example.org`,
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

async function fixture(
  flags: Partial<{
    involvesMinor: boolean;
    involvesHomeownerOrApplicant: boolean;
    involvesOtherIdentifiablePerson: boolean;
    depictsPrivateResidence: boolean;
    containsSensitivePersonalCircumstances: boolean;
  }> = {},
) {
  const submission = await receivePublicStorySubmission(
    prisma,
    {
      submitterName: "Confidential submitter",
      submitterEmail: `c6b3c-${randomUUID()}@example.org`,
      relationshipToHabitat: "Volunteer",
      storyText:
        "A sufficiently long confidential story for rights clearance integration coverage.",
      contactConsent: true,
      privacyNoticeVersion: "privacy-v1",
      privacyNoticeAcceptedAt: fixedNow,
      editorialReviewAcknowledged: true,
      sensitiveDataWarningAcknowledged: true,
      ...flags,
    },
    { now: () => fixedNow },
  );
  const row = await prisma.publicStorySubmission.findFirstOrThrow({
    where: { receivedAt: fixedNow },
    orderBy: { createdAt: "desc" },
  });
  const attempt = await prisma.publicStorySubmissionAttempt.create({
    data: {
      recoveryTokenHash: randomUUID().replaceAll("-", ""),
      status: "SUBMITTED",
      expiresAt: new Date(fixedNow.getTime() + 86_400_000),
      submissionId: row.id,
    },
  });
  const media = await prisma.publicStorySubmissionMedia.create({
    data: {
      attemptId: attempt.id,
      submissionId: row.id,
      ordinal: 0,
      originalFilename: "private-image.jpg",
      declaredMimeType: "image/jpeg",
      originalByteSize: 100,
      uploadAuthorizationNonceHash: randomUUID().replaceAll("-", ""),
      technicalStatus: PublicStorySubmissionMediaStatus.READY,
      processedAt: fixedNow,
      ...flags,
    },
  });
  return {
    submissionId: row.id,
    submissionVersion: 1,
    mediaId: media.id,
    received: submission,
  };
}

async function createClearance(
  actorValue: Actor,
  input: Parameters<typeof createPublicStorySubmissionMediaClearance>[2],
) {
  return createPublicStorySubmissionMediaClearance(prisma, actorValue, input, {
    now: () => fixedNow,
  });
}

async function verify(
  actorValue: Actor,
  clearanceId: string,
  version: number,
  dateObtained = fixedNow,
) {
  return verifyPublicStorySubmissionMediaClearance(
    prisma,
    actorValue,
    { clearanceId, expectedClearanceVersion: version, dateObtained },
    { now: () => fixedNow },
  );
}

async function imageRights(
  actorValue: Actor,
  submissionId: string,
  mediaId: string,
  allowed = true,
) {
  const created = await createClearance(actorValue, {
    submissionId,
    clearanceType: PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
    mediaIds: [mediaId],
    dateObtained: fixedNow,
    evidenceType: PublicStorySubmissionMediaEvidenceType.NEW_RELEASE,
    websitePublicationAllowed: allowed,
    socialMediaAllowed: allowed,
    printAllowed: allowed,
    fundraisingPromotionalAllowed: allowed,
    paidAdvertisingAllowed: allowed,
  });
  await verify(actorValue, created.id, created.version);
  return created.id;
}

describe("C6B-3C confidential Story Submission image rights clearance PostgreSQL domain", () => {
  let reviewer: Actor;
  let superAdmin: Actor;
  let denied: Actor;

  beforeAll(async () => {
    reviewer = await actor("communications-manager");
    superAdmin = await actor("super-admin");
    denied = await actor("platform-admin");
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
  });

  it("persists versioned rights declarations and submitter likeness consent without public records", async () => {
    const item = await fixture();
    const updated = await recordPublicStorySubmissionRightsDeclaration(
      prisma,
      {
        submissionId: item.submissionId,
        expectedSubmissionVersion: 1,
        rightsDeclarationVersion: "rights-v1",
        rightsDeclarationAccepted: true,
        rightsDeclarationAcceptedAt: fixedNow,
        submitterLikenessConsentVersion: "likeness-v1",
        submitterLikenessConsentAccepted: true,
        submitterLikenessConsentAcceptedAt: fixedNow,
      },
      { now: () => fixedNow },
    );
    expect(updated.version).toBe(2);
    const row = await prisma.publicStorySubmission.findUniqueOrThrow({
      where: { id: item.submissionId },
    });
    expect(row.rightsDeclarationVersion).toBe("rights-v1");
    expect(row.submitterLikenessConsentVersion).toBe("likeness-v1");
    expect(
      await prisma.publication.count({ where: { id: item.submissionId } }),
    ).toBe(0);
    await expect(
      recordPublicStorySubmissionRightsDeclaration(prisma, {
        submissionId: item.submissionId,
        expectedSubmissionVersion: 1,
        rightsDeclarationVersion: "rights-v2",
        rightsDeclarationAccepted: true,
        rightsDeclarationAcceptedAt: fixedNow,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it("requires an active reviewer and scopes confidential subjects to one submission and exact images", async () => {
    const item = await fixture();
    await expect(
      createPublicStorySubmissionMediaSubject(prisma, denied, {
        submissionId: item.submissionId,
        displayLabel: "Person A",
        subjectType: PublicStorySubmissionMediaSubjectType.IDENTIFIABLE_ADULT,
        mediaIds: [item.mediaId],
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    const subject = await createPublicStorySubmissionMediaSubject(
      prisma,
      reviewer,
      {
        submissionId: item.submissionId,
        displayLabel: "Person A",
        subjectType: PublicStorySubmissionMediaSubjectType.IDENTIFIABLE_ADULT,
        mediaIds: [item.mediaId],
      },
    );
    const persisted =
      await prisma.publicStorySubmissionMediaSubject.findUniqueOrThrow({
        where: { id: subject.id },
        include: { media: true },
      });
    expect(persisted.displayLabel).toBe("Person A");
    expect(persisted.media.map(({ mediaId }) => mediaId)).toEqual([
      item.mediaId,
    ]);
  });

  it("creates pending image-rights clearance with restrictive false-by-default usage and safe admin DTO", async () => {
    const item = await fixture();
    const created = await createClearance(reviewer, {
      submissionId: item.submissionId,
      clearanceType: PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
      mediaIds: [item.mediaId],
      evidenceType: PublicStorySubmissionMediaEvidenceType.NEW_RELEASE,
    });
    expect(created.version).toBe(1);
    const detail = await listPublicStorySubmissionMediaClearancesForReview(
      prisma,
      reviewer,
      item.submissionId,
      fixedNow,
    );
    expect(detail[0]).toMatchObject({
      status: "PENDING",
      usage: {
        websitePublicationAllowed: false,
        paidAdvertisingAllowed: false,
      },
      applicableMediaIds: [item.mediaId],
    });
    expect(JSON.stringify(detail)).not.toContain("submitterEmail");
  });

  it("rejects incomplete existing-release evidence and invalid subject/type combinations", async () => {
    const item = await fixture();
    await expect(
      createClearance(reviewer, {
        submissionId: item.submissionId,
        clearanceType: PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
        mediaIds: [item.mediaId],
        evidenceType:
          PublicStorySubmissionMediaEvidenceType.EXISTING_HABITAT_RELEASE,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    const subject = await createPublicStorySubmissionMediaSubject(
      prisma,
      reviewer,
      {
        submissionId: item.submissionId,
        displayLabel: "Adult",
        subjectType: PublicStorySubmissionMediaSubjectType.IDENTIFIABLE_ADULT,
        mediaIds: [item.mediaId],
      },
    );
    await expect(
      createClearance(reviewer, {
        submissionId: item.submissionId,
        clearanceType: PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
        subjectId: subject.id,
        mediaIds: [item.mediaId],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it.each([
    [
      PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
      "websitePublicationAllowed",
    ],
    [PublicStorySubmissionMediaUse.SOCIAL_MEDIA, "socialMediaAllowed"],
    [PublicStorySubmissionMediaUse.PRINT, "printAllowed"],
    [
      PublicStorySubmissionMediaUse.FUNDRAISING_PROMOTIONAL,
      "fundraisingPromotionalAllowed",
    ],
    [PublicStorySubmissionMediaUse.PAID_ADVERTISING, "paidAdvertisingAllowed"],
  ] as const)(
    "requires explicit permission for %s",
    async (use, permission) => {
      const item = await fixture();
      await imageRights(reviewer, item.submissionId, item.mediaId, false);
      const result = await evaluatePublicStorySubmissionMediaEligibility(
        prisma,
        { mediaId: item.mediaId, proposedUse: use, now: fixedNow },
      );
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("USAGE_NOT_PERMITTED");
      expect(permission).toContain("Allowed");
    },
  );

  it("resolves a ready image only when all required clearances are verified, applicable, unexpired, and permitted", async () => {
    const item = await fixture({
      involvesHomeownerOrApplicant: true,
      depictsPrivateResidence: true,
      containsSensitivePersonalCircumstances: true,
    });
    let result = await evaluatePublicStorySubmissionMediaEligibility(prisma, {
      mediaId: item.mediaId,
      proposedUse: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
      now: fixedNow,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "MISSING_IMAGE_RIGHTS",
        "MISSING_HOMEOWNER_APPLICANT_CLEARANCE",
        "MISSING_PRIVATE_RESIDENCE_CLEARANCE",
        "MISSING_SENSITIVE_CIRCUMSTANCES_CLEARANCE",
      ]),
    );
    await imageRights(reviewer, item.submissionId, item.mediaId);
    for (const clearanceType of [
      PublicStorySubmissionMediaClearanceType.HOMEOWNER_APPLICANT,
      PublicStorySubmissionMediaClearanceType.PRIVATE_RESIDENCE,
      PublicStorySubmissionMediaClearanceType.SENSITIVE_CIRCUMSTANCES,
    ]) {
      const created = await createClearance(reviewer, {
        submissionId: item.submissionId,
        clearanceType,
        mediaIds: [item.mediaId],
        dateObtained: fixedNow,
        evidenceType:
          PublicStorySubmissionMediaEvidenceType.STAFF_PRIVACY_REVIEW,
        websitePublicationAllowed: true,
      });
      await verify(reviewer, created.id, created.version);
    }
    result = await evaluatePublicStorySubmissionMediaEligibility(prisma, {
      mediaId: item.mediaId,
      proposedUse: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
      now: fixedNow,
    });
    expect(result).toMatchObject({
      eligible: true,
      reasons: [],
      restrictionState: "NONE",
    });
  });

  it("requires distinct adult, minor guardian, and submitter likeness clearances", async () => {
    const item = await fixture({
      involvesMinor: true,
      involvesOtherIdentifiablePerson: true,
    });
    const minor = await createPublicStorySubmissionMediaSubject(
      prisma,
      reviewer,
      {
        submissionId: item.submissionId,
        displayLabel: "Minor subject",
        subjectType: PublicStorySubmissionMediaSubjectType.MINOR,
        mediaIds: [item.mediaId],
      },
    );
    const adult = await createPublicStorySubmissionMediaSubject(
      prisma,
      reviewer,
      {
        submissionId: item.submissionId,
        displayLabel: "Adult subject",
        subjectType: PublicStorySubmissionMediaSubjectType.IDENTIFIABLE_ADULT,
        mediaIds: [item.mediaId],
      },
    );
    const submitter = await createPublicStorySubmissionMediaSubject(
      prisma,
      reviewer,
      {
        submissionId: item.submissionId,
        displayLabel: "Submitter",
        subjectType: PublicStorySubmissionMediaSubjectType.IDENTIFIABLE_ADULT,
        isSubmitter: true,
        mediaIds: [item.mediaId],
      },
    );
    await imageRights(reviewer, item.submissionId, item.mediaId);
    for (const [clearanceType, subjectId, evidenceType] of [
      [
        PublicStorySubmissionMediaClearanceType.MINOR_GUARDIAN,
        minor.id,
        PublicStorySubmissionMediaEvidenceType.NEW_RELEASE,
      ],
      [
        PublicStorySubmissionMediaClearanceType.IDENTIFIABLE_ADULT,
        adult.id,
        PublicStorySubmissionMediaEvidenceType.NEW_RELEASE,
      ],
      [
        PublicStorySubmissionMediaClearanceType.SUBMITTER_LIKENESS,
        submitter.id,
        PublicStorySubmissionMediaEvidenceType.SUBMITTER_LIKENESS_CONSENT,
      ],
    ] as const) {
      const created = await createClearance(reviewer, {
        submissionId: item.submissionId,
        clearanceType,
        subjectId,
        mediaIds: [item.mediaId],
        dateObtained: fixedNow,
        evidenceType,
        websitePublicationAllowed: true,
      });
      await verify(reviewer, created.id, created.version);
    }
    const result = await evaluatePublicStorySubmissionMediaEligibility(prisma, {
      mediaId: item.mediaId,
      proposedUse: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
      now: fixedNow,
    });
    expect(result.eligible).toBe(true);
  });

  it("derives expiration and preserves revoked/rejected history", async () => {
    const item = await fixture();
    const expired = await createClearance(reviewer, {
      submissionId: item.submissionId,
      clearanceType: PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
      mediaIds: [item.mediaId],
      dateObtained: fixedNow,
      expiresAt: new Date(fixedNow.getTime() - 1),
      evidenceType: PublicStorySubmissionMediaEvidenceType.NEW_RELEASE,
      websitePublicationAllowed: true,
    });
    await verify(reviewer, expired.id, expired.version);
    const result = await evaluatePublicStorySubmissionMediaEligibility(prisma, {
      mediaId: item.mediaId,
      proposedUse: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
      now: fixedNow,
    });
    expect(result.reasons).toContain("CLEARANCE_EXPIRED");
    const rejected = await createClearance(reviewer, {
      submissionId: item.submissionId,
      clearanceType: PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
      mediaIds: [item.mediaId],
      dateObtained: fixedNow,
      evidenceType: PublicStorySubmissionMediaEvidenceType.NEW_RELEASE,
    });
    await rejectPublicStorySubmissionMediaClearance(prisma, reviewer, {
      clearanceId: rejected.id,
      expectedClearanceVersion: rejected.version,
    });
    await expect(
      revokePublicStorySubmissionMediaClearance(prisma, reviewer, {
        clearanceId: rejected.id,
        expectedClearanceVersion: 2,
        revocationReason: "STAFF_REVIEW",
      }),
    ).resolves.toMatchObject({ version: 3 });
    const rows = await prisma.publicStorySubmissionMediaClearance.findMany({
      where: { submissionId: item.submissionId },
      orderBy: { createdAt: "asc" },
    });
    expect(rows.map((row) => row.status)).toEqual(["VERIFIED", "REVOKED"]);
  });

  it("protects applicability and clearance edits with optimistic versions", async () => {
    const item = await fixture();
    const second = await prisma.publicStorySubmissionMedia.create({
      data: {
        attemptId: (
          await prisma.publicStorySubmissionAttempt.findFirstOrThrow({
            where: { submissionId: item.submissionId },
          })
        ).id,
        submissionId: item.submissionId,
        ordinal: 1,
        originalFilename: "second.jpg",
        declaredMimeType: "image/jpeg",
        originalByteSize: 100,
        uploadAuthorizationNonceHash: randomUUID().replaceAll("-", ""),
        technicalStatus: "READY",
        processedAt: fixedNow,
      },
    });
    const created = await createClearance(reviewer, {
      submissionId: item.submissionId,
      clearanceType: PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
      mediaIds: [item.mediaId],
      dateObtained: fixedNow,
      evidenceType: PublicStorySubmissionMediaEvidenceType.NEW_RELEASE,
    });
    const changed = await setPublicStorySubmissionMediaClearanceApplicability(
      prisma,
      reviewer,
      {
        clearanceId: created.id,
        expectedClearanceVersion: 1,
        mediaIds: [second.id],
      },
    );
    expect(changed.version).toBe(2);
    await expect(
      setPublicStorySubmissionMediaClearanceApplicability(prisma, reviewer, {
        clearanceId: created.id,
        expectedClearanceVersion: 1,
        mediaIds: [item.mediaId],
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it("rejects stale restrictions and preserves the active restriction version", async () => {
    const item = await fixture();
    const first = await restrictPublicStorySubmissionMedia(prisma, reviewer, {
      mediaId: item.mediaId,
      reason: "STAFF_REVIEW_REQUIRED",
      expectedRestrictionVersion: null,
    });
    const changed = await restrictPublicStorySubmissionMedia(prisma, reviewer, {
      mediaId: item.mediaId,
      reason: "PRIVACY_CONCERN",
      expectedRestrictionVersion: first.version,
    });
    expect(changed.version).toBe(2);
    await expect(
      restrictPublicStorySubmissionMedia(prisma, reviewer, {
        mediaId: item.mediaId,
        reason: "CLEARANCE_INSUFFICIENT",
        expectedRestrictionVersion: first.version,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it("restricts media, denies reviewer restore, and permits only a higher-capability restore after re-clearance", async () => {
    const item = await fixture();
    await imageRights(reviewer, item.submissionId, item.mediaId);
    const restriction = await restrictPublicStorySubmissionMedia(
      prisma,
      reviewer,
      {
        mediaId: item.mediaId,
        reason: "STAFF_REVIEW_REQUIRED",
        expectedRestrictionVersion: null,
      },
      { now: () => fixedNow },
    );
    const blocked = await evaluatePublicStorySubmissionMediaEligibility(
      prisma,
      {
        mediaId: item.mediaId,
        proposedUse: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
        now: fixedNow,
      },
    );
    expect(blocked).toMatchObject({
      eligible: false,
      restrictionState: "ACTIVE",
      reasons: ["MEDIA_RESTRICTED"],
    });
    await expect(
      restorePublicStorySubmissionMediaEligibility(prisma, reviewer, {
        mediaId: item.mediaId,
        proposedUse: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
        expectedRestrictionVersion: restriction.version,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    const restored = await restorePublicStorySubmissionMediaEligibility(
      prisma,
      superAdmin,
      {
        mediaId: item.mediaId,
        proposedUse: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
        expectedRestrictionVersion: restriction.version,
      },
      { now: () => fixedNow },
    );
    expect(restored.version).toBe(2);
    expect(
      (
        await evaluatePublicStorySubmissionMediaEligibility(prisma, {
          mediaId: item.mediaId,
          proposedUse: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
          now: fixedNow,
        })
      ).eligible,
    ).toBe(true);
  });

  it("records a subject revocation request and immediately restricts the exact image", async () => {
    const item = await fixture();
    const subject = await createPublicStorySubmissionMediaSubject(
      prisma,
      reviewer,
      {
        submissionId: item.submissionId,
        displayLabel: "Subject requesting withdrawal",
        subjectType: PublicStorySubmissionMediaSubjectType.IDENTIFIABLE_ADULT,
        mediaIds: [item.mediaId],
      },
    );
    const request = await recordPublicStorySubmissionMediaRevocationRequest(
      prisma,
      reviewer,
      {
        mediaId: item.mediaId,
        subjectId: subject.id,
        confidentialNote: "Subject requested withdrawal.",
      },
      { now: () => fixedNow },
    );
    expect(request.version).toBe(1);
    const restriction =
      await prisma.publicStorySubmissionMediaRestriction.findFirstOrThrow({
        where: { mediaId: item.mediaId, state: "ACTIVE" },
      });
    expect(restriction.reason).toBe("SUBJECT_REVOCATION_REQUEST");
    const persisted =
      await prisma.publicStorySubmissionMediaRevocationRequest.findUniqueOrThrow(
        { where: { id: request.id } },
      );
    expect(persisted.status).toBe("OPEN");
  });

  it("does not commit a clearance when its audit writer fails", async () => {
    const item = await fixture();
    const auditsBefore = await prisma.auditEvent.count({
      where: { targetType: "PublicStorySubmissionMediaClearance" },
    });
    await expect(
      createPublicStorySubmissionMediaClearance(
        prisma,
        reviewer,
        {
          submissionId: item.submissionId,
          clearanceType: PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
          mediaIds: [item.mediaId],
        },
        {
          auditWriter: async () => {
            throw new Error("audit unavailable");
          },
        },
      ),
    ).rejects.toThrow("audit unavailable");
    expect(
      await prisma.publicStorySubmissionMediaClearance.count({
        where: { submissionId: item.submissionId },
      }),
    ).toBe(0);
    expect(
      await prisma.auditEvent.count({
        where: { targetType: "PublicStorySubmissionMediaClearance" },
      }),
    ).toBe(auditsBefore);
  });

  it.each(["verify", "revoke", "restrict", "restore"] as const)(
    "rolls back %s when the success audit fails",
    async (operation) => {
      const item = await fixture();
      if (operation === "verify") {
        const clearance = await createClearance(reviewer, {
          submissionId: item.submissionId,
          clearanceType: PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
          mediaIds: [item.mediaId],
          dateObtained: fixedNow,
          evidenceType: PublicStorySubmissionMediaEvidenceType.NEW_RELEASE,
        });
        await expect(
          verifyPublicStorySubmissionMediaClearance(
            prisma,
            reviewer,
            {
              clearanceId: clearance.id,
              expectedClearanceVersion: 1,
              dateObtained: fixedNow,
            },
            {
              auditWriter: async () => {
                throw new Error("audit unavailable");
              },
            },
          ),
        ).rejects.toThrow("audit unavailable");
        expect(
          await prisma.publicStorySubmissionMediaClearance.findUniqueOrThrow({
            where: { id: clearance.id },
          }),
        ).toMatchObject({ status: "PENDING", version: 1 });
      } else if (operation === "revoke") {
        const clearance = await createClearance(reviewer, {
          submissionId: item.submissionId,
          clearanceType: PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
          mediaIds: [item.mediaId],
          dateObtained: fixedNow,
          evidenceType: PublicStorySubmissionMediaEvidenceType.NEW_RELEASE,
          websitePublicationAllowed: true,
        });
        await verify(reviewer, clearance.id, clearance.version);
        await expect(
          revokePublicStorySubmissionMediaClearance(
            prisma,
            reviewer,
            {
              clearanceId: clearance.id,
              expectedClearanceVersion: 2,
              revocationReason: "STAFF_REVIEW",
            },
            {
              auditWriter: async () => {
                throw new Error("audit unavailable");
              },
            },
          ),
        ).rejects.toThrow("audit unavailable");
        expect(
          await prisma.publicStorySubmissionMediaClearance.findUniqueOrThrow({
            where: { id: clearance.id },
          }),
        ).toMatchObject({ status: "VERIFIED", version: 2 });
      } else if (operation === "restrict") {
        await expect(
          restrictPublicStorySubmissionMedia(
            prisma,
            reviewer,
            {
              mediaId: item.mediaId,
              reason: "STAFF_REVIEW_REQUIRED",
              expectedRestrictionVersion: null,
            },
            {
              auditWriter: async () => {
                throw new Error("audit unavailable");
              },
            },
          ),
        ).rejects.toThrow("audit unavailable");
        expect(
          await prisma.publicStorySubmissionMediaRestriction.count({
            where: { mediaId: item.mediaId },
          }),
        ).toBe(0);
      } else {
        await imageRights(reviewer, item.submissionId, item.mediaId);
        const restriction = await restrictPublicStorySubmissionMedia(
          prisma,
          reviewer,
          {
            mediaId: item.mediaId,
            reason: "STAFF_REVIEW_REQUIRED",
            expectedRestrictionVersion: null,
          },
        );
        await expect(
          restorePublicStorySubmissionMediaEligibility(
            prisma,
            superAdmin,
            {
              mediaId: item.mediaId,
              proposedUse: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
              expectedRestrictionVersion: restriction.version,
            },
            {
              auditWriter: async () => {
                throw new Error("audit unavailable");
              },
            },
          ),
        ).rejects.toThrow("audit unavailable");
        expect(
          await prisma.publicStorySubmissionMediaRestriction.findFirstOrThrow({
            where: { id: restriction.id },
          }),
        ).toMatchObject({ state: "ACTIVE", version: 1 });
      }
    },
  );

  it("requires re-clearing before restoration and leaves the image restricted", async () => {
    const item = await fixture();
    const restriction = await restrictPublicStorySubmissionMedia(
      prisma,
      reviewer,
      {
        mediaId: item.mediaId,
        reason: "CLEARANCE_INSUFFICIENT",
        expectedRestrictionVersion: null,
      },
    );
    await expect(
      restorePublicStorySubmissionMediaEligibility(prisma, superAdmin, {
        mediaId: item.mediaId,
        proposedUse: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
        expectedRestrictionVersion: restriction.version,
      }),
    ).rejects.toBeInstanceOf(PreconditionError);
    expect(
      await prisma.publicStorySubmissionMediaRestriction.findFirstOrThrow({
        where: { id: restriction.id },
      }),
    ).toMatchObject({ state: "ACTIVE", version: 1 });
  });

  it("keeps technical readiness as a prerequisite and never resolves public promotion data", async () => {
    const item = await fixture();
    await prisma.publicStorySubmissionMedia.update({
      where: { id: item.mediaId },
      data: { technicalStatus: "PROCESSING" },
    });
    await imageRights(reviewer, item.submissionId, item.mediaId);
    const result = await evaluatePublicStorySubmissionMediaEligibility(prisma, {
      mediaId: item.mediaId,
      proposedUse: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
      now: fixedNow,
    });
    expect(result).toMatchObject({
      eligible: false,
      reasons: ["MEDIA_NOT_READY"],
    });
    expect(Object.keys(result).sort()).toEqual(
      [
        "eligible",
        "mediaId",
        "proposedUse",
        "reasons",
        "restrictionState",
      ].sort(),
    );
    expect(
      await prisma.publicStorySubmissionMedia.count({
        where: { id: item.mediaId },
      }),
    ).toBe(1);
  });

  it("does not create a MediaAsset, public URL, queue/dashboard row, or Story projection", async () => {
    const publicationsBefore = await prisma.publication.count();
    const projectionsBefore = await prisma.publicStoryProjection.count();
    const item = await fixture();
    await imageRights(reviewer, item.submissionId, item.mediaId);
    expect(await prisma.publication.count()).toBe(publicationsBefore);
    expect(await prisma.publicStoryProjection.count()).toBe(projectionsBefore);
    expect(
      await prisma.publicStorySubmissionMediaRevocationRequest.count({
        where: { mediaId: item.mediaId },
      }),
    ).toBe(0);
  });
});
