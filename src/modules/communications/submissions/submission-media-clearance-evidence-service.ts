import { createHash, randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  PublicStorySubmissionMediaClearanceEvidenceStatus,
  PublicStorySubmissionMediaClearanceStatus,
} from "@/generated/prisma/client";
import { buildAuditEvent } from "@/platform/audit/event";
import type { Capability } from "@/platform/auth/capabilities";
import type { AdminPrincipal } from "@/platform/auth/principal";
import {
  AuthorizationError,
  ConcurrencyError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from "@/platform/errors/app-error";
import {
  createOpaqueObjectKey,
  type SubmissionClearanceEvidenceStoragePort,
} from "@/platform/storage";

import type { SubmissionAuditWriter } from "./submission-service";
import {
  assertClearanceEvidenceIdentifier,
  assertClearanceEvidenceVersion,
  CLEARANCE_EVIDENCE_MAX_DOCUMENTS,
  formatForClearanceEvidenceMimeType,
  validateClearanceEvidenceByteSize,
  validateClearanceEvidenceMimeType,
  type ClearanceEvidenceMimeType,
} from "./submission-media-clearance-evidence-content";
import {
  ClearanceEvidenceProcessingError,
  processClearanceEvidence,
} from "./submission-media-clearance-evidence-processing";
import {
  issueClearanceEvidenceUploadAuthorization,
  verifyClearanceEvidenceUploadAuthorization,
} from "./submission-media-clearance-evidence-upload-auth";

type Transaction = Prisma.TransactionClient;
type Reviewer = Pick<AdminPrincipal, "adminUserId" | "capabilities">;

export type ClearanceEvidenceServiceDependencies = Readonly<{
  now?: () => Date;
  auditWriter?: SubmissionAuditWriter;
  createOriginalStorageKey?: () => string;
  createReviewStorageKey?: () => string;
}>;

const evidenceSelect = {
  id: true,
  clearanceId: true,
  replacesEvidenceDocumentId: true,
  declaredFormat: true,
  detectedFormat: true,
  technicalStatus: true,
  rejectionReason: true,
  originalByteSize: true,
  originalFilename: true,
  originalStorageKey: true,
  originalSha256: true,
  uploadAuthorizationNonceHash: true,
  pageCount: true,
  processedAt: true,
  rejectedAt: true,
  removedAt: true,
  binaryDeletedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  reviewPages: {
    select: {
      id: true,
      ordinal: true,
      width: true,
      height: true,
      byteSize: true,
      storageKey: true,
    },
  },
} satisfies Prisma.PublicStorySubmissionMediaClearanceEvidenceDocumentSelect;

type EvidenceRecord =
  Prisma.PublicStorySubmissionMediaClearanceEvidenceDocumentGetPayload<{
    select: typeof evidenceSelect;
  }>;

export type ClearanceEvidenceAdminItem = Readonly<{
  id: string;
  clearanceId: string;
  replacesEvidenceDocumentId: string | null;
  declaredFormat: string;
  detectedFormat: string | null;
  technicalStatus: PublicStorySubmissionMediaClearanceEvidenceStatus;
  rejectionReason: string | null;
  originalByteSize: number | null;
  pageCount: number | null;
  processedAt: Date | null;
  rejectedAt: Date | null;
  removedAt: Date | null;
  version: number;
  reviewPages: readonly Readonly<{
    id: string;
    ordinal: number;
    width: number;
    height: number;
    byteSize: number;
  }>[];
  createdAt: Date;
  updatedAt: Date;
}>;

export type ClearanceEvidenceDelivery = Readonly<{
  body: Uint8Array;
  contentType: string;
  contentDisposition: "attachment" | "inline";
}>;

function nowFrom(dependencies: ClearanceEvidenceServiceDependencies) {
  return dependencies.now?.() ?? new Date();
}

function hash(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function toAdminItem(record: EvidenceRecord): ClearanceEvidenceAdminItem {
  return {
    id: record.id,
    clearanceId: record.clearanceId,
    replacesEvidenceDocumentId: record.replacesEvidenceDocumentId,
    declaredFormat: record.declaredFormat,
    detectedFormat: record.detectedFormat,
    technicalStatus: record.technicalStatus,
    rejectionReason: record.rejectionReason,
    originalByteSize: record.originalByteSize,
    pageCount: record.pageCount,
    processedAt: record.processedAt,
    rejectedAt: record.rejectedAt,
    removedAt: record.removedAt,
    version: record.version,
    reviewPages: record.reviewPages
      .map((page) => ({
        id: page.id,
        ordinal: page.ordinal,
        width: page.width,
        height: page.height,
        byteSize: page.byteSize,
      }))
      .sort((left, right) => left.ordinal - right.ordinal),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mimeForFormat(format: string) {
  switch (format) {
    case "PDF":
      return "application/pdf";
    case "JPEG":
      return "image/jpeg";
    case "PNG":
      return "image/png";
    case "WEBP":
      return "image/webp";
    case "HEIF":
      return "image/heif";
    default:
      throw new ValidationError("Evidence format is invalid.");
  }
}

function requireCapability(actor: Reviewer) {
  if (
    !actor.capabilities.includes(
      "communications.submissions.review" as Capability,
    )
  )
    throw new AuthorizationError();
}

async function requireActiveReviewer(
  transaction: Transaction,
  actor: Reviewer,
) {
  requireCapability(actor);
  await requireActiveReviewerId(transaction, actor.adminUserId);
}

async function requireActiveReviewerId(
  transaction: Transaction,
  adminUserId: string,
) {
  const admin = await transaction.adminUser.findFirst({
    where: {
      id: adminUserId,
      status: "ACTIVE",
      roleAssignments: {
        some: {
          revokedAt: null,
          role: {
            isActive: true,
            permissions: {
              some: {
                permission: { key: "communications.submissions.review" },
              },
            },
          },
        },
      },
    },
    select: { id: true },
  });
  if (!admin) throw new AuthorizationError();
}

const writeAudit: SubmissionAuditWriter = async (transaction, data) => {
  await transaction.auditEvent.create({ data });
};

async function transactionally<T>(
  prisma: PrismaClient,
  operation: (transaction: Transaction) => Promise<T>,
) {
  try {
    return await prisma.$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2025", "P2034"].includes(error.code)
    )
      throw new ConcurrencyError();
    throw error;
  }
}

async function getEvidence(transaction: Transaction, id: string) {
  const evidence =
    await transaction.publicStorySubmissionMediaClearanceEvidenceDocument.findUnique(
      {
        where: { id },
        select: evidenceSelect,
      },
    );
  if (!evidence)
    throw new NotFoundError("Clearance evidence document was not found.");
  return evidence;
}

async function deleteEvidenceBinaries(
  prisma: PrismaClient,
  storage: SubmissionClearanceEvidenceStoragePort,
  evidence: EvidenceRecord,
  now: Date,
) {
  const keys = [
    evidence.originalStorageKey,
    ...evidence.reviewPages.map((page) => page.storageKey),
  ].filter((key): key is string => key !== null);
  for (const key of keys) await storage.deleteForCleanup(key);
  await prisma.publicStorySubmissionMediaClearanceEvidenceDocument.updateMany({
    where: { id: evidence.id, binaryDeletedAt: null },
    data: { binaryDeletedAt: now },
  });
}

async function rejectEvidence(
  prisma: PrismaClient,
  storage: SubmissionClearanceEvidenceStoragePort,
  input: {
    evidenceDocumentId: string;
    processingVersion?: number;
    reason: EvidenceRecord["rejectionReason"];
    actorAdminUserId?: string;
  },
  now: Date,
) {
  const rejected = await transactionally(prisma, async (transaction) => {
    const evidence = await getEvidence(transaction, input.evidenceDocumentId);
    if (["REJECTED", "REMOVED"].includes(evidence.technicalStatus))
      return evidence;
    if (
      input.processingVersion !== undefined &&
      (evidence.technicalStatus !== "PROCESSING" ||
        evidence.version !== input.processingVersion)
    )
      return null;
    const updated =
      await transaction.publicStorySubmissionMediaClearanceEvidenceDocument.update(
        {
          where: { id_version: { id: evidence.id, version: evidence.version } },
          data: {
            technicalStatus: "REJECTED",
            rejectionReason: input.reason,
            rejectedAt: now,
            version: { increment: 1 },
          },
          select: evidenceSelect,
        },
      );
    const auditBase = {
      action: "public_story_submission_media.clearance_evidence_rejected",
      targetType: "PublicStorySubmissionMediaClearanceEvidenceDocument",
      targetId: updated.id,
      correlationId: randomUUID(),
      summary: {
        clearanceId: updated.clearanceId,
        rejectionReason: input.reason ?? "PROCESSING_FAILED",
        version: updated.version,
      },
    };
    await writeAudit(
      transaction,
      buildAuditEvent(
        input.actorAdminUserId
          ? {
              ...auditBase,
              actorKind: "ADMIN_USER",
              actorAdminUserId: input.actorAdminUserId,
            }
          : { ...auditBase, actorKind: "SYSTEM" },
      ),
    );
    return updated;
  });
  if (rejected) await deleteEvidenceBinaries(prisma, storage, rejected, now);
  return rejected;
}

export async function issuePublicStorySubmissionClearanceEvidenceUpload(
  prisma: PrismaClient,
  actor: Reviewer,
  input: {
    readonly clearanceId: string;
    readonly expectedClearanceVersion: number;
    readonly declaredMimeType: string;
    readonly originalFilename?: string | null;
    readonly replacesEvidenceDocumentId?: string | null;
    readonly uploadAuthorizationSecret: string;
  },
  dependencies: ClearanceEvidenceServiceDependencies = {},
) {
  assertClearanceEvidenceIdentifier(input.clearanceId, "Clearance ID");
  assertClearanceEvidenceVersion(
    input.expectedClearanceVersion,
    "Clearance version",
  );
  validateClearanceEvidenceMimeType(input.declaredMimeType);
  const declaredMimeType = input.declaredMimeType;
  if (input.replacesEvidenceDocumentId)
    assertClearanceEvidenceIdentifier(
      input.replacesEvidenceDocumentId,
      "Replacement evidence ID",
    );
  const extension =
    input.originalFilename
      ?.split(/[\\/]/u)
      .at(-1)
      ?.split(".")
      .at(-1)
      ?.toLowerCase() ?? null;
  if (extension && extension.length > 10)
    throw new ValidationError("Evidence filename extension is invalid.");
  const now = nowFrom(dependencies);
  const evidenceId = randomUUID();
  const result = await transactionally(prisma, async (transaction) => {
    await requireActiveReviewer(transaction, actor);
    const clearance =
      await transaction.publicStorySubmissionMediaClearance.findUnique({
        where: { id: input.clearanceId },
        select: { id: true, version: true },
      });
    if (!clearance) throw new NotFoundError("Clearance was not found.");
    if (clearance.version !== input.expectedClearanceVersion)
      throw new ConcurrencyError();
    const retained =
      await transaction.publicStorySubmissionMediaClearanceEvidenceDocument.count(
        {
          where: {
            clearanceId: clearance.id,
            technicalStatus: { notIn: ["REJECTED", "REMOVED"] },
          },
        },
      );
    if (retained >= CLEARANCE_EVIDENCE_MAX_DOCUMENTS)
      throw new ValidationError(
        "A clearance may retain no more than 10 evidence documents.",
      );
    if (input.replacesEvidenceDocumentId) {
      const replacement =
        await transaction.publicStorySubmissionMediaClearanceEvidenceDocument.findFirst(
          {
            where: {
              id: input.replacesEvidenceDocumentId,
              clearanceId: clearance.id,
              technicalStatus: { not: "REMOVED" },
            },
            select: { id: true },
          },
        );
      if (!replacement)
        throw new ValidationError(
          "Replacement evidence must belong to this clearance.",
        );
    }
    const authorization = issueClearanceEvidenceUploadAuthorization({
      secret: input.uploadAuthorizationSecret,
      clearanceId: clearance.id,
      evidenceDocumentId: evidenceId,
      uploaderAdminUserId: actor.adminUserId,
      slot: retained + 1,
      mimeType: declaredMimeType,
      now,
    });
    const bound = verifyClearanceEvidenceUploadAuthorization(
      authorization.token,
      {
        secret: input.uploadAuthorizationSecret,
        now,
      },
    );
    if (!bound)
      throw new ValidationError(
        "Evidence upload authorization could not be issued.",
      );
    const created =
      await transaction.publicStorySubmissionMediaClearanceEvidenceDocument.create(
        {
          data: {
            id: evidenceId,
            clearanceId: clearance.id,
            replacesEvidenceDocumentId:
              input.replacesEvidenceDocumentId ?? null,
            declaredFormat:
              formatForClearanceEvidenceMimeType(declaredMimeType),
            originalFilename: input.originalFilename?.trim() || null,
            originalStorageKey: (
              dependencies.createOriginalStorageKey ??
              (() =>
                createOpaqueObjectKey("submission-clearance-evidence/original"))
            )(),
            uploadAuthorizationNonceHash: hash(bound.nonce),
          },
          select: evidenceSelect,
        },
      );
    await (dependencies.auditWriter ?? writeAudit)(
      transaction,
      buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action:
          "public_story_submission_media.clearance_evidence_upload_issued",
        targetType: "PublicStorySubmissionMediaClearanceEvidenceDocument",
        targetId: created.id,
        correlationId: randomUUID(),
        summary: {
          clearanceId: clearance.id,
          declaredFormat: created.declaredFormat,
          replacement:
            input.replacesEvidenceDocumentId !== null &&
            input.replacesEvidenceDocumentId !== undefined,
          version: created.version,
        },
      }),
    );
    return { created, authorization };
  });
  return {
    evidence: toAdminItem(result.created),
    uploadAuthorization: result.authorization.token,
    uploadAuthorizationExpiresAt: result.authorization.expiresAt,
  };
}

export async function uploadPublicStorySubmissionClearanceEvidence(
  prisma: PrismaClient,
  storage: SubmissionClearanceEvidenceStoragePort,
  input: {
    readonly uploadAuthorization: string;
    readonly uploadAuthorizationSecret: string;
    readonly body: Uint8Array;
    readonly declaredMimeType: string;
  },
  dependencies: ClearanceEvidenceServiceDependencies = {},
) {
  const now = nowFrom(dependencies);
  const authorization = verifyClearanceEvidenceUploadAuthorization(
    input.uploadAuthorization,
    { secret: input.uploadAuthorizationSecret, now },
  );
  if (!authorization || authorization.mimeType !== input.declaredMimeType)
    throw new ValidationError(
      "Evidence upload authorization is invalid or expired.",
    );
  validateClearanceEvidenceMimeType(input.declaredMimeType);
  try {
    validateClearanceEvidenceByteSize(
      input.body.byteLength,
      input.declaredMimeType,
    );
  } catch (error) {
    await rejectEvidence(
      prisma,
      storage,
      {
        evidenceDocumentId: authorization.evidenceDocumentId,
        reason: "FILE_TOO_LARGE",
        actorAdminUserId: authorization.uploaderAdminUserId,
      },
      now,
    );
    throw error;
  }
  const initial =
    await prisma.publicStorySubmissionMediaClearanceEvidenceDocument.findUnique(
      {
        where: { id: authorization.evidenceDocumentId },
        select: evidenceSelect,
      },
    );
  if (
    !initial ||
    initial.clearanceId !== authorization.clearanceId ||
    initial.uploadAuthorizationNonceHash !== hash(authorization.nonce) ||
    initial.technicalStatus !== "PENDING_UPLOAD" ||
    !initial.originalStorageKey
  )
    throw new ValidationError(
      "Evidence upload authorization is invalid or already used.",
    );
  await storage.putOriginal({
    key: initial.originalStorageKey,
    body: input.body,
    contentType: input.declaredMimeType,
    classification: "CONFIDENTIAL",
  });
  try {
    const uploaded = await transactionally(prisma, async (transaction) => {
      await requireActiveReviewerId(
        transaction,
        authorization.uploaderAdminUserId,
      );
      const evidence = await getEvidence(transaction, initial.id);
      if (
        evidence.technicalStatus !== "PENDING_UPLOAD" ||
        evidence.version !== initial.version ||
        evidence.uploadAuthorizationNonceHash !== hash(authorization.nonce)
      )
        throw new ConcurrencyError();
      const updated =
        await transaction.publicStorySubmissionMediaClearanceEvidenceDocument.update(
          {
            where: {
              id_version: { id: evidence.id, version: evidence.version },
            },
            data: {
              technicalStatus: "UPLOADED",
              originalByteSize: input.body.byteLength,
              originalSha256: hash(input.body),
              uploadAuthorizationNonceHash: hash(
                `consumed:${authorization.nonce}`,
              ),
              version: { increment: 1 },
            },
            select: evidenceSelect,
          },
        );
      await (dependencies.auditWriter ?? writeAudit)(
        transaction,
        buildAuditEvent({
          actorKind: "ADMIN_USER",
          actorAdminUserId: authorization.uploaderAdminUserId,
          action: "public_story_submission_media.clearance_evidence_uploaded",
          targetType: "PublicStorySubmissionMediaClearanceEvidenceDocument",
          targetId: updated.id,
          correlationId: randomUUID(),
          summary: {
            clearanceId: updated.clearanceId,
            byteSize: input.body.byteLength,
            version: updated.version,
          },
        }),
      );
      return updated;
    });
    return { kind: "uploaded" as const, evidence: toAdminItem(uploaded) };
  } catch (error) {
    await storage.deleteForCleanup(initial.originalStorageKey);
    throw error;
  }
}

export async function processPublicStorySubmissionClearanceEvidence(
  prisma: PrismaClient,
  storage: SubmissionClearanceEvidenceStoragePort,
  actor: Reviewer,
  input: {
    readonly evidenceDocumentId: string;
    readonly expectedEvidenceVersion: number;
  },
  dependencies: ClearanceEvidenceServiceDependencies = {},
) {
  assertClearanceEvidenceIdentifier(
    input.evidenceDocumentId,
    "Evidence document ID",
  );
  assertClearanceEvidenceVersion(
    input.expectedEvidenceVersion,
    "Evidence document version",
  );
  const now = nowFrom(dependencies);
  const claimed = await transactionally(prisma, async (transaction) => {
    await requireActiveReviewer(transaction, actor);
    const evidence = await getEvidence(transaction, input.evidenceDocumentId);
    if (evidence.version !== input.expectedEvidenceVersion)
      throw new ConcurrencyError();
    if (evidence.technicalStatus !== "UPLOADED")
      throw new ValidationError("Only uploaded evidence may be processed.");
    if (!evidence.originalStorageKey)
      throw new ValidationError(
        "Evidence is missing confidential processing data.",
      );
    return transaction.publicStorySubmissionMediaClearanceEvidenceDocument.update(
      {
        where: { id_version: { id: evidence.id, version: evidence.version } },
        data: { technicalStatus: "PROCESSING", version: { increment: 1 } },
        select: evidenceSelect,
      },
    );
  });
  const processingVersion = claimed.version;
  const derivativeKeys: string[] = [];
  try {
    const original = await storage.readForProcessing(
      claimed.originalStorageKey!,
    );
    if (!original)
      throw new Error("Confidential evidence original is unavailable.");
    const processed = await processClearanceEvidence({
      body: original.body,
      declaredMimeType: mimeForFormat(
        claimed.declaredFormat,
      ) as ClearanceEvidenceMimeType,
      originalFilename: claimed.originalFilename,
    });
    const pages = [] as Array<{
      ordinal: number;
      key: string;
      width: number;
      height: number;
      byteSize: number;
    }>;
    for (const [index, page] of processed.reviewPages.entries()) {
      const key = (
        dependencies.createReviewStorageKey ??
        (() => createOpaqueObjectKey("submission-clearance-evidence/review"))
      )();
      derivativeKeys.push(key);
      const metadata = await storage.putReviewDerivative({
        key,
        body: page.body,
        contentType: "image/jpeg",
        classification: "CONFIDENTIAL",
      });
      pages.push({
        ordinal: index + 1,
        key,
        width: page.width,
        height: page.height,
        byteSize: metadata.byteSize,
      });
    }
    const ready = await transactionally(prisma, async (transaction) => {
      const evidence = await getEvidence(transaction, claimed.id);
      if (
        evidence.technicalStatus !== "PROCESSING" ||
        evidence.version !== processingVersion
      )
        throw new ConcurrencyError();
      const updated =
        await transaction.publicStorySubmissionMediaClearanceEvidenceDocument.update(
          {
            where: {
              id_version: { id: evidence.id, version: evidence.version },
            },
            data: {
              technicalStatus: "READY",
              detectedFormat: processed.detectedFormat,
              pageCount: pages.length,
              processedAt: now,
              version: { increment: 1 },
              reviewPages: {
                create: pages.map((page) => ({
                  ordinal: page.ordinal,
                  storageKey: page.key,
                  width: page.width,
                  height: page.height,
                  byteSize: page.byteSize,
                })),
              },
            },
            select: evidenceSelect,
          },
        );
      await (dependencies.auditWriter ?? writeAudit)(
        transaction,
        buildAuditEvent({
          actorKind: "ADMIN_USER",
          actorAdminUserId: actor.adminUserId,
          action: "public_story_submission_media.clearance_evidence_processed",
          targetType: "PublicStorySubmissionMediaClearanceEvidenceDocument",
          targetId: updated.id,
          correlationId: randomUUID(),
          summary: {
            clearanceId: updated.clearanceId,
            detectedFormat: updated.detectedFormat ?? "NONE",
            reviewPageCount: pages.length,
            version: updated.version,
          },
        }),
      );
      return updated;
    });
    return { kind: "ready" as const, evidence: toAdminItem(ready) };
  } catch (error) {
    for (const key of derivativeKeys) await storage.deleteForCleanup(key);
    if (error instanceof ClearanceEvidenceProcessingError) {
      const rejected = await rejectEvidence(
        prisma,
        storage,
        {
          evidenceDocumentId: claimed.id,
          processingVersion,
          reason: error.reason,
          actorAdminUserId: actor.adminUserId,
        },
        now,
      );
      if (rejected) return { kind: "rejected" as const, reason: error.reason };
      throw new ConcurrencyError();
    }
    await transactionally(prisma, async (transaction) => {
      const evidence = await getEvidence(transaction, claimed.id);
      if (
        evidence.technicalStatus !== "PROCESSING" ||
        evidence.version !== processingVersion
      )
        throw new ConcurrencyError();
      await transaction.publicStorySubmissionMediaClearanceEvidenceDocument.update(
        {
          where: { id_version: { id: evidence.id, version: evidence.version } },
          data: { technicalStatus: "UPLOADED", version: { increment: 1 } },
        },
      );
    });
    return { kind: "retryable" as const };
  }
}

export async function listPublicStorySubmissionClearanceEvidenceForReview(
  prisma: PrismaClient,
  actor: Reviewer,
  clearanceId: string,
) {
  assertClearanceEvidenceIdentifier(clearanceId, "Clearance ID");
  await transactionally(prisma, (transaction) =>
    requireActiveReviewer(transaction, actor),
  );
  const evidence =
    await prisma.publicStorySubmissionMediaClearanceEvidenceDocument.findMany({
      where: { clearanceId },
      select: evidenceSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  return evidence.map(toAdminItem);
}

async function authorizedEvidence(
  prisma: PrismaClient,
  actor: Reviewer,
  evidenceDocumentId: string,
  auditAction: string,
  dependencies: ClearanceEvidenceServiceDependencies,
) {
  return transactionally(prisma, async (transaction) => {
    await requireActiveReviewer(transaction, actor);
    const evidence = await getEvidence(transaction, evidenceDocumentId);
    if (evidence.technicalStatus !== "READY")
      throw new PreconditionError("Evidence is not ready for review.");
    await (dependencies.auditWriter ?? writeAudit)(
      transaction,
      buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action: auditAction,
        targetType: "PublicStorySubmissionMediaClearanceEvidenceDocument",
        targetId: evidence.id,
        correlationId: randomUUID(),
        summary: {
          clearanceId: evidence.clearanceId,
          pageCount: evidence.reviewPages.length,
          version: evidence.version,
        },
      }),
    );
    return evidence;
  });
}

export async function deliverPublicStorySubmissionClearanceEvidenceOriginal(
  prisma: PrismaClient,
  storage: SubmissionClearanceEvidenceStoragePort,
  actor: Reviewer,
  evidenceDocumentId: string,
  dependencies: ClearanceEvidenceServiceDependencies = {},
): Promise<ClearanceEvidenceDelivery> {
  assertClearanceEvidenceIdentifier(evidenceDocumentId, "Evidence document ID");
  const evidence = await authorizedEvidence(
    prisma,
    actor,
    evidenceDocumentId,
    "public_story_submission_media.clearance_evidence_original_accessed",
    dependencies,
  );
  if (!evidence.originalStorageKey)
    throw new PreconditionError("Evidence original is unavailable.");
  const original = await storage.readForAuthorizedReview(
    evidence.originalStorageKey,
  );
  if (!original)
    throw new PreconditionError("Evidence original is unavailable.");
  return {
    body: original.body,
    contentType: mimeForFormat(
      evidence.detectedFormat ?? evidence.declaredFormat,
    ),
    contentDisposition: "attachment",
  };
}

export async function deliverPublicStorySubmissionClearanceEvidenceReviewPage(
  prisma: PrismaClient,
  storage: SubmissionClearanceEvidenceStoragePort,
  actor: Reviewer,
  input: { evidenceDocumentId: string; ordinal: number },
  dependencies: ClearanceEvidenceServiceDependencies = {},
): Promise<ClearanceEvidenceDelivery> {
  assertClearanceEvidenceIdentifier(
    input.evidenceDocumentId,
    "Evidence document ID",
  );
  if (!Number.isInteger(input.ordinal) || input.ordinal < 1)
    throw new ValidationError("Evidence review page is invalid.");
  const evidence = await authorizedEvidence(
    prisma,
    actor,
    input.evidenceDocumentId,
    "public_story_submission_media.clearance_evidence_review_accessed",
    dependencies,
  );
  const page = evidence.reviewPages.find(
    (item) => item.ordinal === input.ordinal,
  );
  if (!page) throw new NotFoundError("Evidence review page was not found.");
  const review = await storage.readForAuthorizedReview(page.storageKey);
  if (!review)
    throw new PreconditionError("Evidence review page is unavailable.");
  return {
    body: review.body,
    contentType: "image/jpeg",
    contentDisposition: "inline",
  };
}

export async function removePublicStorySubmissionClearanceEvidence(
  prisma: PrismaClient,
  storage: SubmissionClearanceEvidenceStoragePort,
  actor: Reviewer,
  input: { evidenceDocumentId: string; expectedEvidenceVersion: number },
  dependencies: ClearanceEvidenceServiceDependencies = {},
) {
  assertClearanceEvidenceIdentifier(
    input.evidenceDocumentId,
    "Evidence document ID",
  );
  assertClearanceEvidenceVersion(
    input.expectedEvidenceVersion,
    "Evidence document version",
  );
  const now = nowFrom(dependencies);
  const removed = await transactionally(prisma, async (transaction) => {
    await requireActiveReviewer(transaction, actor);
    const evidence = await getEvidence(transaction, input.evidenceDocumentId);
    if (evidence.version !== input.expectedEvidenceVersion)
      throw new ConcurrencyError();
    if (evidence.technicalStatus === "REMOVED")
      throw new PreconditionError("Evidence has already been removed.");
    const clearance =
      await transaction.publicStorySubmissionMediaClearance.findUniqueOrThrow({
        where: { id: evidence.clearanceId },
        select: { status: true, verificationEvidenceDocumentId: true },
      });
    if (
      clearance.status === PublicStorySubmissionMediaClearanceStatus.VERIFIED &&
      clearance.verificationEvidenceDocumentId === evidence.id
    )
      throw new PreconditionError(
        "Verified clearance evidence must be replaced and verification updated before removal.",
      );
    const updated =
      await transaction.publicStorySubmissionMediaClearanceEvidenceDocument.update(
        {
          where: { id_version: { id: evidence.id, version: evidence.version } },
          data: {
            technicalStatus: "REMOVED",
            removedAt: now,
            version: { increment: 1 },
          },
          select: evidenceSelect,
        },
      );
    await (dependencies.auditWriter ?? writeAudit)(
      transaction,
      buildAuditEvent({
        actorKind: "ADMIN_USER",
        actorAdminUserId: actor.adminUserId,
        action: "public_story_submission_media.clearance_evidence_removed",
        targetType: "PublicStorySubmissionMediaClearanceEvidenceDocument",
        targetId: updated.id,
        correlationId: randomUUID(),
        summary: { clearanceId: updated.clearanceId, version: updated.version },
      }),
    );
    return updated;
  });
  await deleteEvidenceBinaries(prisma, storage, removed, now);
  return toAdminItem(removed);
}

export async function cleanupRejectedPublicStorySubmissionClearanceEvidence(
  prisma: PrismaClient,
  storage: SubmissionClearanceEvidenceStoragePort,
  input: { now?: Date; limit?: number } = {},
) {
  const now = input.now ?? new Date();
  const evidence =
    await prisma.publicStorySubmissionMediaClearanceEvidenceDocument.findMany({
      where: { technicalStatus: "REJECTED", binaryDeletedAt: null },
      select: evidenceSelect,
      orderBy: [{ rejectedAt: "asc" }, { id: "asc" }],
      take: Math.min(Math.max(input.limit ?? 100, 1), 100),
    });
  for (const item of evidence)
    await deleteEvidenceBinaries(prisma, storage, item, now);
  return { evidenceProcessed: evidence.length };
}
