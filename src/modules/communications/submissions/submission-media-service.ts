import { createHash, randomBytes, randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  PublicStorySubmissionAttemptStatus,
  PublicStorySubmissionMediaRejectionReason,
  PublicStorySubmissionMediaStatus,
} from "@/generated/prisma/client";
import type { SubmissionQuarantineStoragePort } from "@/platform/storage";
import { createOpaqueObjectKey } from "@/platform/storage";
import type { AdminPrincipal } from "@/platform/auth/principal";
import {
  AuthorizationError,
  ConcurrencyError,
  NotFoundError,
  ValidationError,
} from "@/platform/errors/app-error";

import {
  SUBMISSION_MEDIA_ATTEMPT_TTL_MS,
  SUBMISSION_MEDIA_MAX_ITEMS,
  SUBMISSION_MEDIA_MAX_TOTAL_BYTES,
  assertAllowedSubmissionMediaTransition,
  isFinalizableSubmissionMediaStatus,
  isRetainedSubmissionMediaStatus,
  type SubmissionMediaSensitivity,
  validateOriginalFilename,
  validateSubmissionMediaSensitivity,
  validateSubmissionMediaByteSize,
  validateSubmissionMediaDescription,
  validateSubmissionMediaMimeType,
  validateSubmissionMediaOrder,
  validateSuggestedPhotoCredit,
} from "./submission-media-content";
import {
  processSubmissionMediaImage,
  SubmissionMediaProcessingError,
} from "./submission-media-processing";
import {
  issueSubmissionMediaUploadAuthorization,
  verifySubmissionMediaUploadAuthorization,
} from "./submission-media-upload-auth";

export type SubmissionMediaTransaction = Prisma.TransactionClient;
type Transaction = SubmissionMediaTransaction;
type SubmissionReviewActor = Pick<
  AdminPrincipal,
  "adminUserId" | "capabilities"
>;

export type SubmissionMediaServiceDependencies = Readonly<{
  now?: () => Date;
  createStorageKey?: () => string;
}>;

export type SubmissionMediaAttemptCreation = Readonly<{
  id: string;
  recoveryToken: string;
  expiresAt: Date;
  version: number;
}>;

export type SubmissionMediaAttemptSummary = Readonly<{
  attemptId: string;
  expiresAt: Date;
  status: PublicStorySubmissionAttemptStatus;
  version: number;
  media: readonly SubmissionMediaRecoveryItem[];
}>;

export type SubmissionMediaRecoveryItem = Readonly<{
  id: string;
  version: number;
  ordinal: number | null;
  byteSize: number | null;
  technicalStatus: PublicStorySubmissionMediaStatus;
  rejectionReason: PublicStorySubmissionMediaRejectionReason | null;
  description: string | null;
  suggestedPhotoCredit: string | null;
  sensitivity: SubmissionMediaSensitivity;
}>;

export type SubmissionMediaAdminItem = Readonly<{
  id: string;
  version: number;
  ordinal: number | null;
  originalFilename: string | null;
  declaredMimeType: string | null;
  byteSize: number | null;
  technicalStatus: PublicStorySubmissionMediaStatus;
  rejectionReason: PublicStorySubmissionMediaRejectionReason | null;
  description: string | null;
  suggestedPhotoCredit: string | null;
  sensitivity: SubmissionMediaSensitivity;
  detectedFormat: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  reviewDerivativeFormat: string | null;
  reviewDerivativeWidth: number | null;
  reviewDerivativeHeight: number | null;
  reviewDerivativeByteSize: number | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type SubmissionMediaReviewDelivery = Readonly<{
  body: Uint8Array;
  contentType: "image/jpeg";
  contentDisposition: "inline";
}>;

type AttemptRecord = Awaited<ReturnType<typeof findAttempt>>;

const mediaSelect = {
  id: true,
  attemptId: true,
  submissionId: true,
  originalFilename: true,
  declaredMimeType: true,
  originalByteSize: true,
  ordinal: true,
  description: true,
  suggestedPhotoCredit: true,
  involvesMinor: true,
  involvesHomeownerOrApplicant: true,
  involvesOtherIdentifiablePerson: true,
  depictsPrivateResidence: true,
  containsSensitivePersonalCircumstances: true,
  technicalStatus: true,
  rejectionReason: true,
  quarantineStorageKey: true,
  detectedFormat: true,
  sourceWidth: true,
  sourceHeight: true,
  reviewDerivativeStorageKey: true,
  reviewDerivativeFormat: true,
  reviewDerivativeWidth: true,
  reviewDerivativeHeight: true,
  reviewDerivativeByteSize: true,
  processedAt: true,
  originalSha256: true,
  uploadAuthorizationNonceHash: true,
  removedAt: true,
  rejectedAt: true,
  binaryDeletedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PublicStorySubmissionMediaSelect;

const attemptSelect = {
  id: true,
  recoveryTokenHash: true,
  status: true,
  expiresAt: true,
  submissionId: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  media: { select: mediaSelect, orderBy: [{ ordinal: "asc" }, { id: "asc" }] },
} satisfies Prisma.PublicStorySubmissionAttemptSelect;

type MediaRecord = Prisma.PublicStorySubmissionMediaGetPayload<{
  select: typeof mediaSelect;
}>;

function nowFrom(dependencies: SubmissionMediaServiceDependencies) {
  return dependencies.now?.() ?? new Date();
}

function hash(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function recoveryToken() {
  return randomBytes(32).toString("base64url");
}

function sensitivity(media: MediaRecord): SubmissionMediaSensitivity {
  return {
    involvesMinor: media.involvesMinor,
    involvesHomeownerOrApplicant: media.involvesHomeownerOrApplicant,
    involvesOtherIdentifiablePerson: media.involvesOtherIdentifiablePerson,
    depictsPrivateResidence: media.depictsPrivateResidence,
    containsSensitivePersonalCircumstances:
      media.containsSensitivePersonalCircumstances,
  };
}

function recoveryItem(media: MediaRecord): SubmissionMediaRecoveryItem {
  return {
    id: media.id,
    version: media.version,
    ordinal: media.ordinal,
    byteSize: media.originalByteSize,
    technicalStatus: media.technicalStatus,
    rejectionReason: media.rejectionReason,
    description: media.description,
    suggestedPhotoCredit: media.suggestedPhotoCredit,
    sensitivity: sensitivity(media),
  };
}

function adminItem(media: MediaRecord): SubmissionMediaAdminItem {
  return {
    id: media.id,
    version: media.version,
    ordinal: media.ordinal,
    originalFilename: media.originalFilename,
    declaredMimeType: media.declaredMimeType,
    byteSize: media.originalByteSize,
    technicalStatus: media.technicalStatus,
    rejectionReason: media.rejectionReason,
    description: media.description,
    suggestedPhotoCredit: media.suggestedPhotoCredit,
    sensitivity: sensitivity(media),
    detectedFormat: media.detectedFormat,
    sourceWidth: media.sourceWidth,
    sourceHeight: media.sourceHeight,
    reviewDerivativeFormat: media.reviewDerivativeFormat,
    reviewDerivativeWidth: media.reviewDerivativeWidth,
    reviewDerivativeHeight: media.reviewDerivativeHeight,
    reviewDerivativeByteSize: media.reviewDerivativeByteSize,
    processedAt: media.processedAt,
    createdAt: media.createdAt,
    updatedAt: media.updatedAt,
  };
}

async function findAttempt(transaction: Transaction, id: string) {
  const attempt = await transaction.publicStorySubmissionAttempt.findUnique({
    where: { id },
    select: attemptSelect,
  });
  if (!attempt)
    throw new NotFoundError("Submission media attempt was not found.");
  return attempt;
}

async function findAttemptByRecoveryToken(
  transaction: Transaction,
  token: string,
) {
  const attempt = await transaction.publicStorySubmissionAttempt.findUnique({
    where: { recoveryTokenHash: hash(token) },
    select: attemptSelect,
  });
  if (!attempt)
    throw new NotFoundError("Submission media attempt was not found.");
  return attempt;
}

async function requireSubmissionReviewAdmin(
  prisma: PrismaClient,
  actor: SubmissionReviewActor,
) {
  if (!actor.capabilities.includes("communications.submissions.review")) {
    throw new AuthorizationError();
  }
  const active = await prisma.adminUser.findFirst({
    where: { id: actor.adminUserId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!active) throw new AuthorizationError();
}

function assertActiveAttempt(attempt: AttemptRecord, now: Date) {
  if (
    attempt.status === PublicStorySubmissionAttemptStatus.EXPIRED ||
    attempt.expiresAt <= now
  ) {
    throw new ValidationError("This upload attempt has expired.");
  }
  if (attempt.status !== PublicStorySubmissionAttemptStatus.ACTIVE) {
    throw new ValidationError("This upload attempt is no longer active.");
  }
}

function retainedMedia(media: readonly MediaRecord[]) {
  return media.filter((item) =>
    isRetainedSubmissionMediaStatus(item.technicalStatus),
  );
}

async function replaceOrder(
  transaction: Transaction,
  attemptId: string,
  mediaIds: readonly string[],
) {
  for (const [index, id] of mediaIds.entries()) {
    await transaction.publicStorySubmissionMedia.update({
      where: { id },
      data: { ordinal: -(index + 1) },
    });
  }
  for (const [index, id] of mediaIds.entries()) {
    await transaction.publicStorySubmissionMedia.update({
      where: { id },
      data: { ordinal: index + 1 },
    });
  }
  await transaction.publicStorySubmissionMedia.updateMany({
    where: { attemptId, id: { notIn: [...mediaIds] }, ordinal: { not: null } },
    data: { ordinal: null },
  });
}

async function markBinaryDeleted(
  prisma: PrismaClient,
  mediaId: string,
  now: Date,
) {
  await prisma.publicStorySubmissionMedia.updateMany({
    where: { id: mediaId, binaryDeletedAt: null },
    data: { binaryDeletedAt: now },
  });
}

async function deleteBinaryIfPresent(
  prisma: PrismaClient,
  storage: SubmissionQuarantineStoragePort,
  media: Pick<
    MediaRecord,
    "id" | "quarantineStorageKey" | "reviewDerivativeStorageKey"
  >,
  now: Date,
) {
  const keys = [
    media.quarantineStorageKey,
    media.reviewDerivativeStorageKey,
  ].filter((key): key is string => key !== null);
  if (keys.length === 0) return;
  for (const key of keys) await storage.deleteForCleanup(key);
  await markBinaryDeleted(prisma, media.id, now);
}

async function rejectMedia(
  prisma: PrismaClient,
  storage: SubmissionQuarantineStoragePort,
  mediaId: string,
  reason: PublicStorySubmissionMediaRejectionReason,
  now: Date,
) {
  const record = await prisma.$transaction(
    async (transaction) => {
      const media =
        await transaction.publicStorySubmissionMedia.findUniqueOrThrow({
          where: { id: mediaId },
          select: mediaSelect,
        });
      if (["REJECTED", "REMOVED"].includes(media.technicalStatus)) return media;
      const active = await transaction.publicStorySubmissionMedia.findMany({
        where: {
          attemptId: media.attemptId,
          technicalStatus: { notIn: ["REJECTED", "REMOVED"] },
        },
        select: { id: true, ordinal: true },
        orderBy: [{ ordinal: "asc" }, { id: "asc" }],
      });
      await transaction.publicStorySubmissionMedia.update({
        where: { id: media.id },
        data: {
          technicalStatus: PublicStorySubmissionMediaStatus.REJECTED,
          rejectionReason: reason,
          rejectedAt: now,
          ordinal: null,
          version: { increment: 1 },
        },
      });
      await replaceOrder(
        transaction,
        media.attemptId,
        active.filter((item) => item.id !== media.id).map((item) => item.id),
      );
      return media;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  await deleteBinaryIfPresent(prisma, storage, record, now);
}

export async function createPublicStorySubmissionAttempt(
  prisma: PrismaClient,
  dependencies: SubmissionMediaServiceDependencies = {},
): Promise<SubmissionMediaAttemptCreation> {
  const now = nowFrom(dependencies);
  const token = recoveryToken();
  const expiresAt = new Date(now.getTime() + SUBMISSION_MEDIA_ATTEMPT_TTL_MS);
  const created = await prisma.publicStorySubmissionAttempt.create({
    data: { recoveryTokenHash: hash(token), expiresAt },
    select: { id: true, expiresAt: true, version: true },
  });
  return { ...created, recoveryToken: token };
}

export async function getPublicStorySubmissionAttemptRecovery(
  prisma: PrismaClient,
  recovery: string,
): Promise<SubmissionMediaAttemptSummary> {
  const attempt = await prisma.$transaction((transaction) =>
    findAttemptByRecoveryToken(transaction, recovery),
  );
  return {
    attemptId: attempt.id,
    expiresAt: attempt.expiresAt,
    status: attempt.status,
    version: attempt.version,
    media: attempt.media.map(recoveryItem),
  };
}

export async function issuePublicStorySubmissionMediaUpload(
  prisma: PrismaClient,
  input: {
    readonly recoveryToken: string;
    readonly expectedAttemptVersion: number;
    readonly declaredMimeType: string;
    readonly originalFilename?: string | null;
    readonly description?: string | null;
    readonly suggestedPhotoCredit?: string | null;
    readonly sensitivity: SubmissionMediaSensitivity;
    readonly uploadAuthorizationSecret: string;
  },
  dependencies: SubmissionMediaServiceDependencies = {},
) {
  validateSubmissionMediaMimeType(input.declaredMimeType);
  validateSubmissionMediaSensitivity(input.sensitivity);
  const now = nowFrom(dependencies);
  const mediaId = randomUUID();
  try {
    const result = (await prisma.$transaction(
      async (transaction) => {
        const attempt = await findAttemptByRecoveryToken(
          transaction,
          input.recoveryToken,
        );
        if (attempt.version !== input.expectedAttemptVersion)
          throw new ConcurrencyError();
        assertActiveAttempt(attempt, now);
        const active = retainedMedia(attempt.media);
        if (active.length >= SUBMISSION_MEDIA_MAX_ITEMS) {
          throw new ValidationError(
            "A submission attempt may retain no more than 10 images.",
          );
        }
        const boundAuthorization = issueSubmissionMediaUploadAuthorization({
          secret: input.uploadAuthorizationSecret,
          attemptId: attempt.id,
          mediaId,
          mimeType: input.declaredMimeType,
          now,
        });
        const bound = verifySubmissionMediaUploadAuthorization(
          boundAuthorization.token,
          {
            secret: input.uploadAuthorizationSecret,
            now,
          },
        );
        if (!bound)
          throw new ValidationError(
            "Upload authorization could not be issued.",
          );
        const created = await transaction.publicStorySubmissionMedia.create({
          data: {
            id: mediaId,
            attemptId: attempt.id,
            originalFilename: validateOriginalFilename(input.originalFilename),
            declaredMimeType: input.declaredMimeType,
            ordinal: active.length + 1,
            description: validateSubmissionMediaDescription(input.description),
            suggestedPhotoCredit: validateSuggestedPhotoCredit(
              input.suggestedPhotoCredit,
            ),
            ...input.sensitivity,
            quarantineStorageKey: (
              dependencies.createStorageKey ??
              (() => createOpaqueObjectKey("submission-quarantine"))
            )(),
            uploadAuthorizationNonceHash: hash(bound.nonce),
          },
          select: mediaSelect,
        });
        await transaction.publicStorySubmissionAttempt.update({
          where: { id_version: { id: attempt.id, version: attempt.version } },
          data: { version: { increment: 1 } },
        });
        return {
          media: created,
          authorization: boundAuthorization,
          attemptVersion: attempt.version + 1,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )) as {
      media: MediaRecord;
      authorization: { token: string; expiresAt: Date };
      attemptVersion: number;
    };
    return {
      media: recoveryItem(result.media),
      uploadAuthorization: result.authorization.token,
      uploadAuthorizationExpiresAt: result.authorization.expiresAt,
      attemptVersion: result.attemptVersion,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      throw new ConcurrencyError();
    }
    throw error;
  }
}

export async function uploadPublicStorySubmissionMedia(
  prisma: PrismaClient,
  storage: SubmissionQuarantineStoragePort,
  input: {
    readonly uploadAuthorization: string;
    readonly uploadAuthorizationSecret: string;
    readonly body: Uint8Array;
    readonly declaredMimeType: string;
  },
  dependencies: SubmissionMediaServiceDependencies = {},
) {
  const now = nowFrom(dependencies);
  const authorization = verifySubmissionMediaUploadAuthorization(
    input.uploadAuthorization,
    {
      secret: input.uploadAuthorizationSecret,
      now,
    },
  );
  if (!authorization || authorization.mimeType !== input.declaredMimeType) {
    throw new ValidationError("Upload authorization is invalid or expired.");
  }
  try {
    validateSubmissionMediaByteSize(input.body.byteLength);
    if (input.body.byteLength > authorization.maxByteSize)
      throw new ValidationError("An image may not exceed 10 MB.");
  } catch (error) {
    await rejectMedia(
      prisma,
      storage,
      authorization.mediaId,
      PublicStorySubmissionMediaRejectionReason.FILE_TOO_LARGE,
      now,
    );
    throw error;
  }
  const initial = await prisma.publicStorySubmissionMedia.findUnique({
    where: { id: authorization.mediaId },
    select: mediaSelect,
  });
  if (
    !initial ||
    initial.attemptId !== authorization.attemptId ||
    initial.uploadAuthorizationNonceHash !== hash(authorization.nonce)
  ) {
    throw new ValidationError(
      "Upload authorization is invalid or already used.",
    );
  }
  if (
    !initial.quarantineStorageKey ||
    initial.technicalStatus !== PublicStorySubmissionMediaStatus.PENDING_UPLOAD
  ) {
    throw new ValidationError(
      "Upload authorization is invalid or already used.",
    );
  }
  await storage.put({
    key: initial.quarantineStorageKey,
    body: input.body,
    contentType: input.declaredMimeType,
    classification: "CONFIDENTIAL",
  });
  const checksum = hash(input.body);
  try {
    const result = await prisma.$transaction(
      async (transaction) => {
        const attempt = await findAttempt(transaction, authorization.attemptId);
        assertActiveAttempt(attempt, now);
        const media = attempt.media.find(
          (item) => item.id === authorization.mediaId,
        );
        if (
          !media ||
          media.technicalStatus !==
            PublicStorySubmissionMediaStatus.PENDING_UPLOAD ||
          media.uploadAuthorizationNonceHash !== hash(authorization.nonce)
        ) {
          throw new ValidationError(
            "Upload authorization is invalid or already used.",
          );
        }
        const active = retainedMedia(attempt.media);
        const total =
          active.reduce((sum, item) => sum + (item.originalByteSize ?? 0), 0) +
          input.body.byteLength;
        if (total > SUBMISSION_MEDIA_MAX_TOTAL_BYTES) {
          return {
            kind: "rejected" as const,
            reason:
              PublicStorySubmissionMediaRejectionReason.SUBMISSION_TOTAL_TOO_LARGE,
          };
        }
        const duplicate = active.some(
          (item) => item.id !== media.id && item.originalSha256 === checksum,
        );
        if (duplicate) {
          return {
            kind: "rejected" as const,
            reason: PublicStorySubmissionMediaRejectionReason.DUPLICATE_IMAGE,
          };
        }
        const updated = await transaction.publicStorySubmissionMedia.update({
          where: { id_version: { id: media.id, version: media.version } },
          data: {
            technicalStatus: PublicStorySubmissionMediaStatus.UPLOADED,
            originalByteSize: input.body.byteLength,
            originalSha256: checksum,
            uploadAuthorizationNonceHash: hash(
              `consumed:${authorization.nonce}`,
            ),
            version: { increment: 1 },
          },
          select: mediaSelect,
        });
        return { kind: "uploaded" as const, media: updated };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (result.kind === "rejected") {
      await rejectMedia(
        prisma,
        storage,
        authorization.mediaId,
        result.reason,
        now,
      );
      return { kind: "rejected" as const, reason: result.reason };
    }
    return { kind: "uploaded" as const, media: recoveryItem(result.media) };
  } catch (error) {
    await storage.deleteForCleanup(initial.quarantineStorageKey);
    throw error;
  }
}

export async function updatePublicStorySubmissionMediaMetadata(
  prisma: PrismaClient,
  input: {
    readonly recoveryToken: string;
    readonly mediaId: string;
    readonly expectedMediaVersion: number;
    readonly description?: string | null;
    readonly suggestedPhotoCredit?: string | null;
    readonly sensitivity: SubmissionMediaSensitivity;
  },
  dependencies: SubmissionMediaServiceDependencies = {},
) {
  const now = nowFrom(dependencies);
  validateSubmissionMediaSensitivity(input.sensitivity);
  return prisma.$transaction(
    async (transaction) => {
      const attempt = await findAttemptByRecoveryToken(
        transaction,
        input.recoveryToken,
      );
      assertActiveAttempt(attempt, now);
      const media = attempt.media.find((item) => item.id === input.mediaId);
      if (!media) throw new NotFoundError("Submission media was not found.");
      if (media.version !== input.expectedMediaVersion)
        throw new ConcurrencyError();
      if (!isRetainedSubmissionMediaStatus(media.technicalStatus)) {
        throw new ValidationError(
          "Removed or rejected media cannot be edited.",
        );
      }
      const updated = await transaction.publicStorySubmissionMedia.update({
        where: { id_version: { id: media.id, version: media.version } },
        data: {
          description: validateSubmissionMediaDescription(input.description),
          suggestedPhotoCredit: validateSuggestedPhotoCredit(
            input.suggestedPhotoCredit,
          ),
          ...input.sensitivity,
          version: { increment: 1 },
        },
        select: mediaSelect,
      });
      return recoveryItem(updated);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function reorderPublicStorySubmissionMedia(
  prisma: PrismaClient,
  input: {
    readonly recoveryToken: string;
    readonly expectedAttemptVersion: number;
    readonly mediaIds: readonly string[];
  },
  dependencies: SubmissionMediaServiceDependencies = {},
) {
  validateSubmissionMediaOrder(input.mediaIds);
  const now = nowFrom(dependencies);
  return prisma.$transaction(
    async (transaction) => {
      const attempt = await findAttemptByRecoveryToken(
        transaction,
        input.recoveryToken,
      );
      if (attempt.version !== input.expectedAttemptVersion)
        throw new ConcurrencyError();
      assertActiveAttempt(attempt, now);
      const active = retainedMedia(attempt.media);
      const activeIds = active.map((media) => media.id).sort();
      if (
        active.length !== input.mediaIds.length ||
        activeIds.join(",") !== [...input.mediaIds].sort().join(",")
      ) {
        throw new ValidationError(
          "Image order must include every retained image exactly once.",
        );
      }
      await replaceOrder(transaction, attempt.id, input.mediaIds);
      await transaction.publicStorySubmissionAttempt.update({
        where: { id_version: { id: attempt.id, version: attempt.version } },
        data: { version: { increment: 1 } },
      });
      const updated = await findAttempt(transaction, attempt.id);
      return {
        version: updated.version,
        media: updated.media.map(recoveryItem),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function removePublicStorySubmissionMedia(
  prisma: PrismaClient,
  storage: SubmissionQuarantineStoragePort,
  input: {
    readonly recoveryToken: string;
    readonly mediaId: string;
    readonly expectedMediaVersion: number;
  },
  dependencies: SubmissionMediaServiceDependencies = {},
) {
  const now = nowFrom(dependencies);
  const removed = await prisma.$transaction(
    async (transaction) => {
      const attempt = await findAttemptByRecoveryToken(
        transaction,
        input.recoveryToken,
      );
      assertActiveAttempt(attempt, now);
      const media = attempt.media.find((item) => item.id === input.mediaId);
      if (!media) throw new NotFoundError("Submission media was not found.");
      if (media.technicalStatus === PublicStorySubmissionMediaStatus.REMOVED)
        return media;
      if (media.version !== input.expectedMediaVersion)
        throw new ConcurrencyError();
      if (!isRetainedSubmissionMediaStatus(media.technicalStatus)) {
        throw new ValidationError("Rejected media cannot be removed again.");
      }
      await transaction.publicStorySubmissionMedia.update({
        where: { id_version: { id: media.id, version: media.version } },
        data: {
          technicalStatus: PublicStorySubmissionMediaStatus.REMOVED,
          removedAt: now,
          ordinal: null,
          version: { increment: 1 },
        },
      });
      await replaceOrder(
        transaction,
        attempt.id,
        retainedMedia(attempt.media)
          .filter((item) => item.id !== media.id)
          .map((item) => item.id),
      );
      await transaction.publicStorySubmissionAttempt.update({
        where: { id_version: { id: attempt.id, version: attempt.version } },
        data: { version: { increment: 1 } },
      });
      return media;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  await deleteBinaryIfPresent(prisma, storage, removed, now);
}

export async function transitionPublicStorySubmissionMediaTechnicalStatus(
  prisma: PrismaClient,
  storage: SubmissionQuarantineStoragePort,
  input: {
    readonly attemptId: string;
    readonly mediaId: string;
    readonly expectedMediaVersion: number;
    readonly nextStatus: PublicStorySubmissionMediaStatus;
    readonly rejectionReason?: PublicStorySubmissionMediaRejectionReason;
  },
  dependencies: SubmissionMediaServiceDependencies = {},
) {
  const now = nowFrom(dependencies);
  const media = await prisma.$transaction(
    async (transaction) => {
      const attempt = await findAttempt(transaction, input.attemptId);
      assertActiveAttempt(attempt, now);
      const media = attempt.media.find((item) => item.id === input.mediaId);
      if (!media) throw new NotFoundError("Submission media was not found.");
      if (media.version !== input.expectedMediaVersion)
        throw new ConcurrencyError();
      assertAllowedSubmissionMediaTransition(
        media.technicalStatus,
        input.nextStatus,
      );
      if (
        input.nextStatus === PublicStorySubmissionMediaStatus.UPLOADED ||
        input.nextStatus === PublicStorySubmissionMediaStatus.PROCESSING ||
        input.nextStatus === PublicStorySubmissionMediaStatus.READY
      ) {
        throw new ValidationError(
          "Upload and readiness states are assigned only by secure image processing.",
        );
      }
      if (
        input.nextStatus === PublicStorySubmissionMediaStatus.REJECTED &&
        !input.rejectionReason
      ) {
        throw new ValidationError(
          "Rejected media needs a safe rejection reason.",
        );
      }
      const updated = await transaction.publicStorySubmissionMedia.update({
        where: { id_version: { id: media.id, version: media.version } },
        data: {
          technicalStatus: input.nextStatus,
          rejectionReason:
            input.nextStatus === PublicStorySubmissionMediaStatus.REJECTED
              ? (input.rejectionReason ?? null)
              : null,
          rejectedAt:
            input.nextStatus === PublicStorySubmissionMediaStatus.REJECTED
              ? now
              : null,
          ordinal:
            input.nextStatus === PublicStorySubmissionMediaStatus.REJECTED
              ? null
              : media.ordinal,
          version: { increment: 1 },
        },
        select: mediaSelect,
      });
      if (input.nextStatus === PublicStorySubmissionMediaStatus.REJECTED) {
        await replaceOrder(
          transaction,
          attempt.id,
          retainedMedia(attempt.media)
            .filter((item) => item.id !== media.id)
            .map((item) => item.id),
        );
      }
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  if (media.technicalStatus === PublicStorySubmissionMediaStatus.REJECTED) {
    await deleteBinaryIfPresent(prisma, storage, media, now);
  }
  return recoveryItem(media);
}

export type SubmissionMediaProcessingOutcome =
  | Readonly<{ kind: "ready"; media: SubmissionMediaRecoveryItem }>
  | Readonly<{
      kind: "rejected";
      reason: PublicStorySubmissionMediaRejectionReason;
    }>
  | Readonly<{ kind: "retryable"; media: SubmissionMediaRecoveryItem }>;

async function returnProcessingToUploaded(
  prisma: PrismaClient,
  input: { readonly mediaId: string; readonly processingVersion: number },
  now: Date,
) {
  return prisma.$transaction(
    async (transaction) => {
      const media = await transaction.publicStorySubmissionMedia.findUnique({
        where: { id: input.mediaId },
        select: mediaSelect,
      });
      if (
        !media ||
        media.technicalStatus !== PublicStorySubmissionMediaStatus.PROCESSING ||
        media.version !== input.processingVersion
      ) {
        return null;
      }
      const attempt = await findAttempt(transaction, media.attemptId);
      assertActiveAttempt(attempt, now);
      const updated = await transaction.publicStorySubmissionMedia.update({
        where: { id_version: { id: media.id, version: media.version } },
        data: {
          technicalStatus: PublicStorySubmissionMediaStatus.UPLOADED,
          version: { increment: 1 },
        },
        select: mediaSelect,
      });
      return recoveryItem(updated);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function rejectProcessingMedia(
  prisma: PrismaClient,
  storage: SubmissionQuarantineStoragePort,
  input: {
    readonly mediaId: string;
    readonly processingVersion: number;
    readonly reason: PublicStorySubmissionMediaRejectionReason;
  },
  now: Date,
) {
  const rejected = await prisma.$transaction(
    async (transaction) => {
      const media = await transaction.publicStorySubmissionMedia.findUnique({
        where: { id: input.mediaId },
        select: mediaSelect,
      });
      if (
        !media ||
        media.technicalStatus !== PublicStorySubmissionMediaStatus.PROCESSING ||
        media.version !== input.processingVersion
      ) {
        return null;
      }
      const active = await transaction.publicStorySubmissionMedia.findMany({
        where: {
          attemptId: media.attemptId,
          technicalStatus: { notIn: ["REJECTED", "REMOVED"] },
        },
        select: { id: true, ordinal: true },
        orderBy: [{ ordinal: "asc" }, { id: "asc" }],
      });
      const updated = await transaction.publicStorySubmissionMedia.update({
        where: { id_version: { id: media.id, version: media.version } },
        data: {
          technicalStatus: PublicStorySubmissionMediaStatus.REJECTED,
          rejectionReason: input.reason,
          rejectedAt: now,
          ordinal: null,
          version: { increment: 1 },
        },
        select: mediaSelect,
      });
      await replaceOrder(
        transaction,
        media.attemptId,
        active.filter((item) => item.id !== media.id).map((item) => item.id),
      );
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  if (rejected) await deleteBinaryIfPresent(prisma, storage, rejected, now);
  return rejected;
}

/**
 * Claims one uploaded original, validates and sanitizes it outside a database
 * transaction, then makes its private derivative READY with a version guard.
 */
export async function processPublicStorySubmissionMedia(
  prisma: PrismaClient,
  storage: SubmissionQuarantineStoragePort,
  input: {
    readonly attemptId: string;
    readonly mediaId: string;
    readonly expectedMediaVersion: number;
  },
  dependencies: SubmissionMediaServiceDependencies = {},
): Promise<SubmissionMediaProcessingOutcome> {
  const now = nowFrom(dependencies);
  let claimed: MediaRecord;
  try {
    claimed = await prisma.$transaction(
      async (transaction) => {
        const attempt = await findAttempt(transaction, input.attemptId);
        assertActiveAttempt(attempt, now);
        const media = attempt.media.find((item) => item.id === input.mediaId);
        if (!media) throw new NotFoundError("Submission media was not found.");
        if (media.version !== input.expectedMediaVersion)
          throw new ConcurrencyError();
        if (
          media.technicalStatus !== PublicStorySubmissionMediaStatus.UPLOADED
        ) {
          throw new ValidationError("Only uploaded media may be processed.");
        }
        if (!media.quarantineStorageKey || !media.declaredMimeType) {
          throw new ValidationError(
            "Uploaded media is missing secure processing data.",
          );
        }
        return transaction.publicStorySubmissionMedia.update({
          where: { id_version: { id: media.id, version: media.version } },
          data: {
            technicalStatus: PublicStorySubmissionMediaStatus.PROCESSING,
            version: { increment: 1 },
          },
          select: mediaSelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      throw new ConcurrencyError();
    }
    throw error;
  }

  const processingVersion = claimed.version;
  let derivativeKey: string | null = null;
  try {
    const original = await storage.readForProcessing(
      claimed.quarantineStorageKey!,
    );
    if (!original) throw new Error("Confidential original is unavailable.");
    const processed = await processSubmissionMediaImage({
      body: original.body,
      declaredMimeType:
        claimed.declaredMimeType as import("./submission-media-content").SubmissionMediaMimeType,
      originalFilename: claimed.originalFilename,
    });
    derivativeKey = createOpaqueObjectKey("submission-review-derivative");
    const derivativeMetadata = await storage.putReviewDerivative({
      key: derivativeKey,
      body: processed.reviewDerivative,
      contentType: "image/jpeg",
      classification: "CONFIDENTIAL",
    });
    const ready = await prisma.$transaction(
      async (transaction) => {
        const attempt = await findAttempt(transaction, input.attemptId);
        assertActiveAttempt(attempt, now);
        const media = attempt.media.find((item) => item.id === input.mediaId);
        if (
          !media ||
          media.technicalStatus !==
            PublicStorySubmissionMediaStatus.PROCESSING ||
          media.version !== processingVersion
        ) {
          return null;
        }
        return transaction.publicStorySubmissionMedia.update({
          where: { id_version: { id: media.id, version: media.version } },
          data: {
            technicalStatus: PublicStorySubmissionMediaStatus.READY,
            detectedFormat: processed.detectedFormat,
            sourceWidth: processed.sourceWidth,
            sourceHeight: processed.sourceHeight,
            reviewDerivativeStorageKey: derivativeKey,
            reviewDerivativeFormat: processed.reviewDerivativeFormat,
            reviewDerivativeWidth: processed.reviewDerivativeWidth,
            reviewDerivativeHeight: processed.reviewDerivativeHeight,
            reviewDerivativeByteSize: derivativeMetadata.byteSize,
            processedAt: now,
            version: { increment: 1 },
          },
          select: mediaSelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (!ready) {
      await storage.deleteForCleanup(derivativeKey);
      throw new ConcurrencyError();
    }
    return { kind: "ready", media: recoveryItem(ready) };
  } catch (error) {
    if (derivativeKey) await storage.deleteForCleanup(derivativeKey);
    if (error instanceof SubmissionMediaProcessingError) {
      const rejected = await rejectProcessingMedia(
        prisma,
        storage,
        {
          mediaId: input.mediaId,
          processingVersion,
          reason: error.reason,
        },
        now,
      );
      if (rejected) return { kind: "rejected", reason: error.reason };
      throw new ConcurrencyError();
    }
    const retryable = await returnProcessingToUploaded(
      prisma,
      { mediaId: input.mediaId, processingVersion },
      now,
    );
    if (retryable) return { kind: "retryable", media: retryable };
    throw error;
  }
}

export async function associateReadySubmissionMedia(
  prisma: PrismaClient,
  input: {
    readonly recoveryToken: string;
    readonly expectedAttemptVersion: number;
    readonly submissionId: string;
  },
  dependencies: SubmissionMediaServiceDependencies = {},
) {
  const now = nowFrom(dependencies);
  return prisma.$transaction(
    async (transaction) => {
      return associateReadySubmissionMediaInTransaction(
        transaction,
        input,
        now,
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function validateFinalizableSubmissionMediaInTransaction(
  transaction: SubmissionMediaTransaction,
  input: {
    readonly recoveryToken: string;
    readonly expectedAttemptVersion: number;
  },
  now: Date,
) {
  const attempt = await findAttemptByRecoveryToken(
    transaction,
    input.recoveryToken,
  );
  if (attempt.version !== input.expectedAttemptVersion)
    throw new ConcurrencyError();
  assertActiveAttempt(attempt, now);
  const active = retainedMedia(attempt.media);
  if (
    active.some(
      (media) => !isFinalizableSubmissionMediaStatus(media.technicalStatus),
    )
  ) {
    throw new ValidationError(
      "Only Ready images may be attached to a Story submission.",
    );
  }
  return { attempt, mediaCount: active.length };
}

export async function associateReadySubmissionMediaInTransaction(
  transaction: SubmissionMediaTransaction,
  input: {
    readonly recoveryToken: string;
    readonly expectedAttemptVersion: number;
    readonly submissionId: string;
  },
  now: Date,
) {
  const { attempt, mediaCount } =
    await validateFinalizableSubmissionMediaInTransaction(
      transaction,
      input,
      now,
    );
  const submission = await transaction.publicStorySubmission.findUnique({
    where: { id: input.submissionId },
    select: { id: true },
  });
  if (!submission) throw new NotFoundError("Story submission was not found.");
  const active = retainedMedia(attempt.media);
  await transaction.publicStorySubmissionMedia.updateMany({
    where: {
      id: { in: active.map((media) => media.id) },
      attemptId: attempt.id,
    },
    data: { submissionId: submission.id },
  });
  await transaction.publicStorySubmissionAttempt.update({
    where: { id_version: { id: attempt.id, version: attempt.version } },
    data: {
      status: PublicStorySubmissionAttemptStatus.SUBMITTED,
      submissionId: submission.id,
      version: { increment: 1 },
    },
  });
  return {
    attemptId: attempt.id,
    submissionId: submission.id,
    mediaCount,
    version: attempt.version + 1,
  };
}

export async function cleanupExpiredPublicStorySubmissionAttempts(
  prisma: PrismaClient,
  storage: SubmissionQuarantineStoragePort,
  input: { readonly now?: Date; readonly limit?: number } = {},
) {
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 100);
  const attempts = await prisma.publicStorySubmissionAttempt.findMany({
    where: {
      status: PublicStorySubmissionAttemptStatus.ACTIVE,
      expiresAt: { lte: now },
    },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    take: limit,
    select: { id: true },
  });
  let cleaned = 0;
  for (const candidate of attempts) {
    const media = await prisma.$transaction(
      async (transaction) => {
        const attempt = await findAttempt(transaction, candidate.id);
        if (
          attempt.status !== PublicStorySubmissionAttemptStatus.ACTIVE ||
          attempt.expiresAt > now
        )
          return [] as MediaRecord[];
        const active = retainedMedia(attempt.media);
        await transaction.publicStorySubmissionMedia.updateMany({
          where: { id: { in: active.map((item) => item.id) } },
          data: {
            technicalStatus: PublicStorySubmissionMediaStatus.REMOVED,
            removedAt: now,
            ordinal: null,
            version: { increment: 1 },
          },
        });
        await transaction.publicStorySubmissionAttempt.update({
          where: { id_version: { id: attempt.id, version: attempt.version } },
          data: {
            status: PublicStorySubmissionAttemptStatus.EXPIRED,
            version: { increment: 1 },
          },
        });
        return active;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    for (const item of media)
      await deleteBinaryIfPresent(prisma, storage, item, now);
    cleaned += 1;
  }
  return { attemptsProcessed: cleaned };
}

export async function cleanupRejectedSubmissionMedia(
  prisma: PrismaClient,
  storage: SubmissionQuarantineStoragePort,
  input: { readonly now?: Date; readonly limit?: number } = {},
) {
  const now = input.now ?? new Date();
  const media = await prisma.publicStorySubmissionMedia.findMany({
    where: {
      technicalStatus: PublicStorySubmissionMediaStatus.REJECTED,
      binaryDeletedAt: null,
      quarantineStorageKey: { not: null },
    },
    orderBy: [{ rejectedAt: "asc" }, { id: "asc" }],
    take: Math.min(Math.max(input.limit ?? 100, 1), 100),
    select: mediaSelect,
  });
  for (const item of media)
    await deleteBinaryIfPresent(prisma, storage, item, now);
  return { mediaProcessed: media.length };
}

export async function getPublicStorySubmissionMediaForAdministrativeReview(
  prisma: PrismaClient,
  actor: SubmissionReviewActor,
  submissionId: string,
): Promise<readonly SubmissionMediaAdminItem[]> {
  await requireSubmissionReviewAdmin(prisma, actor);
  const media = await prisma.publicStorySubmissionMedia.findMany({
    where: { submissionId },
    orderBy: [{ ordinal: "asc" }, { id: "asc" }],
    select: mediaSelect,
  });
  return media.map(adminItem);
}

export async function deliverPublicStorySubmissionMediaReviewDerivative(
  prisma: PrismaClient,
  storage: SubmissionQuarantineStoragePort,
  actor: SubmissionReviewActor,
  mediaId: string,
  submissionId?: string,
): Promise<SubmissionMediaReviewDelivery> {
  await requireSubmissionReviewAdmin(prisma, actor);
  const media = await prisma.publicStorySubmissionMedia.findUnique({
    where: { id: mediaId },
    select: {
      technicalStatus: true,
      submissionId: true,
      reviewDerivativeStorageKey: true,
      reviewDerivativeFormat: true,
      reviewDerivativeByteSize: true,
    },
  });
  if (!media) throw new NotFoundError("Submission image was not found.");
  if (submissionId !== undefined && media.submissionId !== submissionId)
    throw new NotFoundError("Submission image was not found.");
  if (
    media.technicalStatus !== PublicStorySubmissionMediaStatus.READY ||
    media.reviewDerivativeFormat !== "JPEG" ||
    !media.reviewDerivativeStorageKey ||
    media.reviewDerivativeByteSize === null
  ) {
    throw new ValidationError("This image is not ready for private review.");
  }
  const review = await storage.readForProcessing(
    media.reviewDerivativeStorageKey,
  );
  if (
    !review ||
    review.metadata.scope !== "PRIVATE" ||
    review.metadata.classification !== "CONFIDENTIAL" ||
    review.metadata.contentType !== "image/jpeg" ||
    review.metadata.byteSize !== media.reviewDerivativeByteSize
  ) {
    throw new ValidationError("The private review image is unavailable.");
  }
  return {
    body: review.body,
    contentType: "image/jpeg",
    contentDisposition: "inline",
  };
}
