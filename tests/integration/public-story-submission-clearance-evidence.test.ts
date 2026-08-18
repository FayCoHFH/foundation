import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  PublicStorySubmissionMediaClearanceEvidenceStatus,
  PublicStorySubmissionMediaClearanceEvidenceRejectionReason,
  PublicStorySubmissionMediaClearanceType,
  PublicStorySubmissionMediaEvidenceType,
  PublicStorySubmissionMediaStatus,
} from "@/generated/prisma/client";
import {
  createPublicStorySubmissionMediaClearance,
  deliverPublicStorySubmissionClearanceEvidenceOriginal,
  deliverPublicStorySubmissionClearanceEvidenceReviewPage,
  issuePublicStorySubmissionClearanceEvidenceUpload,
  listPublicStorySubmissionClearanceEvidenceForReview,
  processPublicStorySubmissionClearanceEvidence,
  removePublicStorySubmissionClearanceEvidence,
  uploadPublicStorySubmissionClearanceEvidence,
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
import { createLocalSubmissionClearanceEvidenceStore } from "@/platform/storage";

import { assertDestructiveTestDatabaseSafety } from "../support/destructive-test-database";

const testDatabase = assertDestructiveTestDatabaseSafety();
const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("@/generated/prisma/client");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabase.databaseUrl }),
});
const secret = "c6b3d-integration-evidence-upload-secret-at-least-32-bytes";
const fixedNow = new Date("2044-02-03T04:05:06.000Z");
type Actor = { adminUserId: string; capabilities: readonly Capability[] };

let rootDirectory: string;
let storage: ReturnType<typeof createLocalSubmissionClearanceEvidenceStore>;

function now() {
  return fixedNow;
}

async function actor(roleKey: string): Promise<Actor> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  const user = await prisma.user.create({
    data: {
      id: `c6b3d-${randomUUID()}`,
      name: "C6B3D reviewer",
      email: `c6b3d-${randomUUID()}@example.org`,
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
  await receivePublicStorySubmission(
    prisma,
    {
      submitterName: "Confidential evidence submitter",
      submitterEmail: `c6b3d-${randomUUID()}@example.org`,
      relationshipToHabitat: "Volunteer",
      storyText:
        "A sufficiently long confidential story for private clearance evidence integration coverage.",
      contactConsent: true,
      privacyNoticeVersion: "privacy-v1",
      privacyNoticeAcceptedAt: fixedNow,
      editorialReviewAcknowledged: true,
      sensitiveDataWarningAcknowledged: true,
    },
    { now },
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
      ordinal: 1,
      originalFilename: "private.jpg",
      declaredMimeType: "image/jpeg",
      originalByteSize: 42,
      uploadAuthorizationNonceHash: randomUUID().replaceAll("-", ""),
      technicalStatus: PublicStorySubmissionMediaStatus.READY,
      processedAt: fixedNow,
    },
  });
  const clearance = await createPublicStorySubmissionMediaClearance(
    prisma,
    reviewer,
    {
      submissionId: submission.id,
      clearanceType: PublicStorySubmissionMediaClearanceType.IMAGE_RIGHTS,
      mediaIds: [media.id],
      evidenceType: PublicStorySubmissionMediaEvidenceType.NEW_RELEASE,
      websitePublicationAllowed: true,
    },
    { now },
  );
  return { clearance, submissionId: submission.id };
}

async function jpeg() {
  return new Uint8Array(
    await sharp({
      create: { width: 12, height: 8, channels: 3, background: "#24506d" },
    })
      .jpeg()
      .toBuffer(),
  );
}

function pdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const startxref = Buffer.byteLength(body);
  body += `xref\n0 4\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body));
}

async function issueUploadProcess(
  reviewer: Actor,
  clearanceId: string,
  clearanceVersion: number,
) {
  const issued = await issuePublicStorySubmissionClearanceEvidenceUpload(
    prisma,
    reviewer,
    {
      clearanceId,
      expectedClearanceVersion: clearanceVersion,
      declaredMimeType: "image/jpeg",
      originalFilename: "signed-release.jpg",
      uploadAuthorizationSecret: secret,
    },
    { now },
  );
  const uploaded = await uploadPublicStorySubmissionClearanceEvidence(
    prisma,
    storage,
    {
      uploadAuthorization: issued.uploadAuthorization,
      uploadAuthorizationSecret: secret,
      body: await jpeg(),
      declaredMimeType: "image/jpeg",
    },
    { now },
  );
  if (uploaded.kind !== "uploaded") throw new Error("fixture upload failed");
  const processed = await processPublicStorySubmissionClearanceEvidence(
    prisma,
    storage,
    reviewer,
    {
      evidenceDocumentId: uploaded.evidence.id,
      expectedEvidenceVersion: uploaded.evidence.version,
    },
    { now },
  );
  if (processed.kind !== "ready") throw new Error("fixture processing failed");
  return processed.evidence;
}

beforeAll(async () => {
  rootDirectory = await mkdtemp(join(tmpdir(), "habitat-c6b3d-evidence-"));
  storage = createLocalSubmissionClearanceEvidenceStore({ rootDirectory, now });
});

beforeEach(async () => {
  await prisma.publicStorySubmission.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(rootDirectory, { recursive: true, force: true });
});

describe("C6B-3D confidential clearance evidence PostgreSQL and storage", () => {
  it("processes a private image, exposes only safe DTO data, and requires/audits reviewer delivery", async () => {
    const reviewer = await actor("communications-manager");
    const denied = await actor("platform-admin");
    const { clearance } = await fixture(reviewer);
    const evidence = await issueUploadProcess(
      reviewer,
      clearance.id,
      clearance.version,
    );
    expect(evidence).toMatchObject({
      technicalStatus: PublicStorySubmissionMediaClearanceEvidenceStatus.READY,
      detectedFormat: "JPEG",
      pageCount: 1,
    });
    expect(JSON.stringify(evidence)).not.toContain("StorageKey");
    const listed = await listPublicStorySubmissionClearanceEvidenceForReview(
      prisma,
      reviewer,
      clearance.id,
    );
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed[0])).not.toContain("signed-release");
    await expect(
      deliverPublicStorySubmissionClearanceEvidenceOriginal(
        prisma,
        storage,
        denied,
        evidence.id,
        { now },
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
    const original =
      await deliverPublicStorySubmissionClearanceEvidenceOriginal(
        prisma,
        storage,
        reviewer,
        evidence.id,
        { now },
      );
    const review =
      await deliverPublicStorySubmissionClearanceEvidenceReviewPage(
        prisma,
        storage,
        reviewer,
        { evidenceDocumentId: evidence.id, ordinal: 1 },
        { now },
      );
    expect(original).toMatchObject({
      contentDisposition: "attachment",
      contentType: "image/jpeg",
    });
    expect(review).toMatchObject({
      contentDisposition: "inline",
      contentType: "image/jpeg",
    });
    expect((await sharp(review.body).metadata()).format).toBe("jpeg");
    const audit = await prisma.auditEvent.findMany({
      where: { targetId: evidence.id },
      select: { action: true, summary: true },
    });
    expect(audit.map((item) => item.action)).toEqual(
      expect.arrayContaining([
        "public_story_submission_media.clearance_evidence_upload_issued",
        "public_story_submission_media.clearance_evidence_original_accessed",
        "public_story_submission_media.clearance_evidence_review_accessed",
      ]),
    );
    expect(JSON.stringify(audit)).not.toContain(
      "submission-clearance-evidence/",
    );
  });

  it("enforces one-use authorization, serializes processing, and rejects stale removal", async () => {
    const reviewer = await actor("communications-manager");
    const { clearance } = await fixture(reviewer);
    const issued = await issuePublicStorySubmissionClearanceEvidenceUpload(
      prisma,
      reviewer,
      {
        clearanceId: clearance.id,
        expectedClearanceVersion: clearance.version,
        declaredMimeType: "image/jpeg",
        originalFilename: "release.jpg",
        uploadAuthorizationSecret: secret,
      },
      { now },
    );
    const first = await uploadPublicStorySubmissionClearanceEvidence(
      prisma,
      storage,
      {
        uploadAuthorization: issued.uploadAuthorization,
        uploadAuthorizationSecret: secret,
        body: await jpeg(),
        declaredMimeType: "image/jpeg",
      },
      { now },
    );
    await expect(
      uploadPublicStorySubmissionClearanceEvidence(
        prisma,
        storage,
        {
          uploadAuthorization: issued.uploadAuthorization,
          uploadAuthorizationSecret: secret,
          body: await jpeg(),
          declaredMimeType: "image/jpeg",
        },
        { now },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    if (first.kind !== "uploaded") throw new Error("fixture upload failed");
    const [one, two] = await Promise.allSettled([
      processPublicStorySubmissionClearanceEvidence(
        prisma,
        storage,
        reviewer,
        {
          evidenceDocumentId: first.evidence.id,
          expectedEvidenceVersion: first.evidence.version,
        },
        { now },
      ),
      processPublicStorySubmissionClearanceEvidence(
        prisma,
        storage,
        reviewer,
        {
          evidenceDocumentId: first.evidence.id,
          expectedEvidenceVersion: first.evidence.version,
        },
        { now },
      ),
    ]);
    expect(
      [one, two].filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const ready =
      await prisma.publicStorySubmissionMediaClearanceEvidenceDocument.findUniqueOrThrow(
        { where: { id: first.evidence.id } },
      );
    await expect(
      removePublicStorySubmissionClearanceEvidence(
        prisma,
        storage,
        reviewer,
        {
          evidenceDocumentId: ready.id,
          expectedEvidenceVersion: ready.version - 1,
        },
        { now },
      ),
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it("requires Ready evidence for uploaded-evidence verification and preserves existing reference-only verification", async () => {
    const reviewer = await actor("communications-manager");
    const { clearance } = await fixture(reviewer);
    const issued = await issuePublicStorySubmissionClearanceEvidenceUpload(
      prisma,
      reviewer,
      {
        clearanceId: clearance.id,
        expectedClearanceVersion: clearance.version,
        declaredMimeType: "image/jpeg",
        originalFilename: "release.jpg",
        uploadAuthorizationSecret: secret,
      },
      { now },
    );
    await expect(
      verifyPublicStorySubmissionMediaClearance(
        prisma,
        reviewer,
        {
          clearanceId: clearance.id,
          expectedClearanceVersion: clearance.version,
          evidenceDocumentId: issued.evidence.id,
        },
        { now },
      ),
    ).rejects.toBeInstanceOf(PreconditionError);
    const ready = await issueUploadProcess(
      reviewer,
      clearance.id,
      clearance.version,
    );
    const verified = await verifyPublicStorySubmissionMediaClearance(
      prisma,
      reviewer,
      {
        clearanceId: clearance.id,
        expectedClearanceVersion: clearance.version,
        evidenceDocumentId: ready.id,
      },
      { now },
    );
    await expect(
      removePublicStorySubmissionClearanceEvidence(
        prisma,
        storage,
        reviewer,
        {
          evidenceDocumentId: ready.id,
          expectedEvidenceVersion: ready.version,
        },
        { now },
      ),
    ).rejects.toBeInstanceOf(PreconditionError);
    expect(verified.version).toBe(clearance.version + 1);
  });

  it("persists a valid PDF as private raster review pages without exposing its original by default", async () => {
    const reviewer = await actor("communications-manager");
    const { clearance } = await fixture(reviewer);
    const issued = await issuePublicStorySubmissionClearanceEvidenceUpload(
      prisma,
      reviewer,
      {
        clearanceId: clearance.id,
        expectedClearanceVersion: clearance.version,
        declaredMimeType: "application/pdf",
        originalFilename: "signed-release.pdf",
        uploadAuthorizationSecret: secret,
      },
      { now },
    );
    const uploaded = await uploadPublicStorySubmissionClearanceEvidence(
      prisma,
      storage,
      {
        uploadAuthorization: issued.uploadAuthorization,
        uploadAuthorizationSecret: secret,
        body: pdf(),
        declaredMimeType: "application/pdf",
      },
      { now },
    );
    if (uploaded.kind !== "uploaded") throw new Error("fixture upload failed");
    const processed = await processPublicStorySubmissionClearanceEvidence(
      prisma,
      storage,
      reviewer,
      {
        evidenceDocumentId: uploaded.evidence.id,
        expectedEvidenceVersion: uploaded.evidence.version,
      },
      { now },
    );
    expect(processed).toMatchObject({
      kind: "ready",
      evidence: { detectedFormat: "PDF", pageCount: 1 },
    });
    const listed = await listPublicStorySubmissionClearanceEvidenceForReview(
      prisma,
      reviewer,
      clearance.id,
    );
    expect(JSON.stringify(listed)).not.toContain("originalStorageKey");
    const derivative =
      await deliverPublicStorySubmissionClearanceEvidenceReviewPage(
        prisma,
        storage,
        reviewer,
        { evidenceDocumentId: uploaded.evidence.id, ordinal: 1 },
        { now },
      );
    expect((await sharp(derivative.body).metadata()).format).toBe("jpeg");
  });

  it("rejects unsafe evidence and hard-deletes removed binaries while retaining its tombstone", async () => {
    const reviewer = await actor("communications-manager");
    const { clearance } = await fixture(reviewer);
    const issued = await issuePublicStorySubmissionClearanceEvidenceUpload(
      prisma,
      reviewer,
      {
        clearanceId: clearance.id,
        expectedClearanceVersion: clearance.version,
        declaredMimeType: "image/jpeg",
        originalFilename: "bad.jpg",
        uploadAuthorizationSecret: secret,
      },
      { now },
    );
    const uploaded = await uploadPublicStorySubmissionClearanceEvidence(
      prisma,
      storage,
      {
        uploadAuthorization: issued.uploadAuthorization,
        uploadAuthorizationSecret: secret,
        body: new Uint8Array([0xff, 0xd8, 0xff, 0]),
        declaredMimeType: "image/jpeg",
      },
      { now },
    );
    if (uploaded.kind !== "uploaded") throw new Error("fixture upload failed");
    const rejected = await processPublicStorySubmissionClearanceEvidence(
      prisma,
      storage,
      reviewer,
      {
        evidenceDocumentId: uploaded.evidence.id,
        expectedEvidenceVersion: uploaded.evidence.version,
      },
      { now },
    );
    expect(rejected).toMatchObject({
      kind: "rejected",
      reason:
        PublicStorySubmissionMediaClearanceEvidenceRejectionReason.CORRUPTED_FILE,
    });
    const ready = await issueUploadProcess(
      reviewer,
      clearance.id,
      clearance.version,
    );
    const removed = await removePublicStorySubmissionClearanceEvidence(
      prisma,
      storage,
      reviewer,
      { evidenceDocumentId: ready.id, expectedEvidenceVersion: ready.version },
      { now },
    );
    expect(removed).toMatchObject({
      technicalStatus: "REMOVED",
      removedAt: fixedNow,
    });
    const tombstone =
      await prisma.publicStorySubmissionMediaClearanceEvidenceDocument.findUniqueOrThrow(
        { where: { id: ready.id } },
      );
    expect(tombstone.binaryDeletedAt).toEqual(fixedNow);
    expect(tombstone.technicalStatus).toBe("REMOVED");
    expect(
      await storage.readForProcessing(tombstone.originalStorageKey!),
    ).toBeNull();
  });
});
