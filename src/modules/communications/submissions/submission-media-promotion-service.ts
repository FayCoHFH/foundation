import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  MediaAssetFormat,
  MediaAssetLifecycle,
  PublicStorySubmissionMediaUse,
} from "@/generated/prisma/client";
import { buildAuditEvent } from "@/platform/audit/event";
import type { Capability } from "@/platform/auth/capabilities";
import type { AdminPrincipal } from "@/platform/auth/principal";
import {
  AuthorizationError,
  ConcurrencyError,
  NotFoundError,
  PreconditionError,
} from "@/platform/errors/app-error";
import type {
  PublicObjectStorePort,
  SubmissionQuarantineStoragePort,
} from "@/platform/storage/contracts";
import { createOpaqueObjectKey } from "@/platform/storage/local-object-store";

import type { SubmissionAuditWriter } from "./submission-service";
import { evaluatePublicStorySubmissionMediaEligibilityInTransaction } from "./submission-media-clearance-service";
import {
  assertUuid,
  publicPathForStorageKey,
  toPublicMediaAssetDto,
  validateMediaUsageInput,
  validatePromoteSubmissionMediaInput,
  type CreateMediaUsageInput,
  type PromoteSubmissionMediaInput,
  type PublicMediaAssetAdminDto,
} from "./submission-media-promotion-content";

type Transaction = Prisma.TransactionClient;
type PromotionActor = Pick<AdminPrincipal, "adminUserId" | "capabilities">;

export type MediaPromotionDependencies = Readonly<{
  now?: () => Date;
  auditWriter?: SubmissionAuditWriter;
  createPublicStorageKey?: () => string;
}>;

const writeAudit: SubmissionAuditWriter = async (transaction, data) => {
  await transaction.auditEvent.create({ data });
};

function requireCapability(actor: PromotionActor, capability: Capability) {
  if (!actor.capabilities.includes(capability)) throw new AuthorizationError();
}

async function requireActiveActor(
  transaction: Transaction,
  actor: PromotionActor,
) {
  requireCapability(actor, "communications.media.promote");
  const admin = await transaction.adminUser.findFirst({
    where: { id: actor.adminUserId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!admin) throw new AuthorizationError();
}

function isPrismaCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

type PromotionRecord = Prisma.PublicStorySubmissionMediaPromotionGetPayload<{
  include: {
    mediaAsset: true;
    clearanceSnapshots: true;
  };
}>;

function toAdminDto(
  record: PromotionRecord,
  rightsState: "ELIGIBLE" | "RESTRICTED",
  reasons: readonly string[],
): PublicMediaAssetAdminDto {
  return {
    id: record.mediaAsset.id,
    publicPath: publicPathForStorageKey(record.mediaAsset.publicStorageKey),
    format: record.mediaAsset.format,
    contentType: record.mediaAsset.contentType,
    byteSize: record.mediaAsset.byteSize,
    checksumSha256: record.mediaAsset.checksumSha256,
    width: record.mediaAsset.width,
    height: record.mediaAsset.height,
    lifecycle: record.mediaAsset.lifecycle,
    creditTreatment: record.mediaAsset.creditTreatment,
    publicCredit: record.mediaAsset.publicCredit,
    rightsState,
    restrictionReasons: reasons,
    provenance: {
      sourceMediaId: record.sourceMediaId,
      sourceSubmissionId: record.sourceSubmissionId,
      sourceMediaVersion: record.sourceMediaVersion,
      promotedAt: record.promotedAt,
      promotionId: record.id,
    },
  };
}

async function findPromotion(transaction: Transaction, mediaId: string) {
  return transaction.publicStorySubmissionMediaPromotion.findUnique({
    where: { sourceMediaId: mediaId },
    include: { mediaAsset: true, clearanceSnapshots: true },
  });
}

async function sourceEligibility(
  transaction: Transaction,
  mediaId: string,
  proposedUse: PublicStorySubmissionMediaUse,
  now: Date,
) {
  return evaluatePublicStorySubmissionMediaEligibilityInTransaction(
    transaction,
    mediaId,
    proposedUse,
    now,
  );
}

async function sourceEligibilityFromClient(
  prisma: PrismaClient,
  mediaId: string,
  proposedUse: PublicStorySubmissionMediaUse,
  now: Date,
) {
  return prisma.$transaction((transaction) =>
    sourceEligibility(transaction, mediaId, proposedUse, now),
  );
}

async function assertPublicObjectPresent(
  record: PromotionRecord,
  publicStorage: PublicObjectStorePort,
) {
  if ((await publicStorage.head(record.mediaAsset.publicStorageKey)) === null) {
    throw new PreconditionError(
      "The promoted public object is unavailable and requires administrative reconciliation.",
    );
  }
}

export async function promotePublicStorySubmissionMediaToLibrary(
  prisma: PrismaClient,
  actor: PromotionActor,
  privateStorage: SubmissionQuarantineStoragePort,
  publicStorage: PublicObjectStorePort,
  input: PromoteSubmissionMediaInput,
  dependencies: MediaPromotionDependencies = {},
) {
  const validated = validatePromoteSubmissionMediaInput(input);
  const now = dependencies.now ?? (() => new Date());
  let writtenPublicKey: string | null = null;
  try {
    const result = await prisma.$transaction(
      async (transaction) => {
        await requireActiveActor(transaction, actor);
        const existing = await findPromotion(transaction, validated.mediaId);
        if (existing) return { record: existing, duplicate: true } as const;
        const source = await transaction.publicStorySubmissionMedia.findUnique({
          where: { id: validated.mediaId },
          select: {
            id: true,
            submissionId: true,
            technicalStatus: true,
            version: true,
            processedAt: true,
            reviewDerivativeStorageKey: true,
            reviewDerivativeFormat: true,
            reviewDerivativeWidth: true,
            reviewDerivativeHeight: true,
            reviewDerivativeByteSize: true,
            detectedFormat: true,
            clearances: {
              select: {
                clearance: {
                  select: {
                    id: true,
                    version: true,
                    clearanceType: true,
                    status: true,
                    websitePublicationAllowed: true,
                    socialMediaAllowed: true,
                    printAllowed: true,
                    fundraisingPromotionalAllowed: true,
                    paidAdvertisingAllowed: true,
                    otherRestrictionsPresent: true,
                    expiresAt: true,
                    verificationEvidenceDocumentId: true,
                  },
                },
              },
            },
          },
        });
        if (!source) throw new NotFoundError("Submission image was not found.");
        if (!source.submissionId)
          throw new PreconditionError(
            "The image is not attached to a submission.",
          );
        if (source.version !== validated.expectedMediaVersion)
          throw new ConcurrencyError(
            "The submission image changed before promotion.",
          );
        if (
          source.technicalStatus !== "READY" ||
          source.processedAt === null ||
          source.reviewDerivativeStorageKey === null ||
          source.reviewDerivativeFormat !== "JPEG" ||
          source.reviewDerivativeWidth === null ||
          source.reviewDerivativeHeight === null ||
          source.reviewDerivativeByteSize === null
        ) {
          throw new PreconditionError(
            "Only a ready sanitized JPEG derivative may be promoted.",
          );
        }
        const eligibility = await sourceEligibility(
          transaction,
          source.id,
          PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
          now(),
        );
        if (!eligibility.eligible)
          throw new PreconditionError(
            `Image is not eligible for promotion: ${eligibility.reasons.join(", ")}.`,
          );
        const derivative = await privateStorage.readForProcessing(
          source.reviewDerivativeStorageKey,
        );
        if (
          !derivative ||
          derivative.metadata.scope !== "PRIVATE" ||
          derivative.metadata.classification !== "CONFIDENTIAL" ||
          derivative.metadata.contentType !== "image/jpeg" ||
          derivative.metadata.byteSize !== source.reviewDerivativeByteSize
        ) {
          throw new PreconditionError(
            "The sanitized review derivative is unavailable or invalid.",
          );
        }
        const publicKey = (
          dependencies.createPublicStorageKey ??
          (() => createOpaqueObjectKey("media-library"))
        )();
        writtenPublicKey = publicKey;
        const publicMetadata = await publicStorage.put({
          key: publicKey,
          body: derivative.body,
          contentType: "image/jpeg",
          classification: "PUBLIC",
          contentDisposition: "inline",
        });
        const asset = await transaction.mediaAsset.create({
          data: {
            publicStorageKey: publicKey,
            contentType: publicMetadata.contentType,
            byteSize: publicMetadata.byteSize,
            checksumSha256: publicMetadata.checksumSha256,
            format: MediaAssetFormat.JPEG,
            width: source.reviewDerivativeWidth,
            height: source.reviewDerivativeHeight,
            creditTreatment: validated.creditTreatment,
            publicCredit: validated.publicCredit,
            createdByAdminUserId: actor.adminUserId,
          },
        });
        const promotion =
          await transaction.publicStorySubmissionMediaPromotion.create({
            data: {
              mediaAssetId: asset.id,
              sourceMediaId: source.id,
              sourceSubmissionId: source.submissionId,
              promotedByAdminUserId: actor.adminUserId,
              promotedAt: now(),
              sourceMediaVersion: source.version,
              sourceProcessedAt: source.processedAt,
              sourceDetectedFormat: source.detectedFormat ?? "JPEG",
              baselineUse: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
              creditTreatment: validated.creditTreatment,
              publicCredit: validated.publicCredit,
              clearanceSnapshots: {
                create: source.clearances.map(({ clearance }) => ({
                  clearanceId: clearance.id,
                  clearanceVersion: clearance.version,
                  clearanceType: clearance.clearanceType,
                  status: clearance.status,
                  websitePublicationAllowed:
                    clearance.websitePublicationAllowed,
                  socialMediaAllowed: clearance.socialMediaAllowed,
                  printAllowed: clearance.printAllowed,
                  fundraisingPromotionalAllowed:
                    clearance.fundraisingPromotionalAllowed,
                  paidAdvertisingAllowed: clearance.paidAdvertisingAllowed,
                  otherRestrictionsPresent: clearance.otherRestrictionsPresent,
                  expiresAt: clearance.expiresAt,
                  evidenceDocumentId: clearance.verificationEvidenceDocumentId,
                })),
              },
            },
            include: { mediaAsset: true, clearanceSnapshots: true },
          });
        await (dependencies.auditWriter ?? writeAudit)(
          transaction,
          buildAuditEvent({
            actorKind: "ADMIN_USER",
            actorAdminUserId: actor.adminUserId,
            action: "media_asset.promoted",
            targetType: "MEDIA_ASSET",
            targetId: asset.id,
            summary: {
              sourceMediaId: source.id,
              sourceSubmissionId: source.submissionId,
              sourceMediaVersion: source.version,
              baselineUse: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
              creditTreatment: validated.creditTreatment,
            },
          }),
        );
        return { record: promotion, duplicate: false } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (result.duplicate) {
      await assertPublicObjectPresent(result.record, publicStorage);
      const eligibility = await sourceEligibilityFromClient(
        prisma,
        result.record.sourceMediaId,
        PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
        now(),
      );
      return {
        duplicate: true,
        asset: toAdminDto(
          result.record,
          eligibility.eligible ? "ELIGIBLE" : "RESTRICTED",
          eligibility.reasons,
        ),
      };
    }
    writtenPublicKey = null;
    return {
      duplicate: false,
      asset: toAdminDto(result.record, "ELIGIBLE", []),
    };
  } catch (error) {
    if (writtenPublicKey)
      await publicStorage.deleteForCleanup(writtenPublicKey);
    if (isPrismaCode(error, "P2034")) throw new ConcurrencyError();
    if (isPrismaCode(error, "P2002")) {
      const existing =
        await prisma.publicStorySubmissionMediaPromotion.findUnique({
          where: { sourceMediaId: validated.mediaId },
          include: { mediaAsset: true, clearanceSnapshots: true },
        });
      if (existing) {
        await assertPublicObjectPresent(existing, publicStorage);
        const eligibility = await sourceEligibilityFromClient(
          prisma,
          existing.sourceMediaId,
          PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
          now(),
        );
        return {
          duplicate: true,
          asset: toAdminDto(
            existing,
            eligibility.eligible ? "ELIGIBLE" : "RESTRICTED",
            eligibility.reasons,
          ),
        };
      }
      throw new ConcurrencyError();
    }
    throw error;
  }
}

export async function evaluatePublicMediaAssetEligibility(
  prisma: PrismaClient,
  input: Readonly<{
    mediaAssetId: string;
    proposedUse: PublicStorySubmissionMediaUse;
    now?: Date;
  }>,
) {
  assertUuid(input.mediaAssetId, "Media asset ID");
  return prisma.$transaction(async (transaction) => {
    const asset = await transaction.mediaAsset.findUnique({
      where: { id: input.mediaAssetId },
      select: {
        id: true,
        lifecycle: true,
        promotion: { select: { sourceMediaId: true } },
      },
    });
    if (!asset) throw new NotFoundError("Media asset was not found.");
    const reasons: string[] = [];
    if (asset.lifecycle !== MediaAssetLifecycle.ACTIVE)
      reasons.push("ASSET_ARCHIVED");
    if (!asset.promotion) reasons.push("PROVENANCE_MISSING");
    if (asset.promotion) {
      const source = await sourceEligibility(
        transaction,
        asset.promotion.sourceMediaId,
        input.proposedUse,
        input.now ?? new Date(),
      );
      reasons.push(...source.reasons);
    }
    return {
      mediaAssetId: asset.id,
      proposedUse: input.proposedUse,
      eligible: reasons.length === 0,
      reasons,
    };
  });
}

export async function createPublicMediaUsage(
  prisma: PrismaClient,
  actor: PromotionActor,
  input: CreateMediaUsageInput,
  dependencies: Pick<MediaPromotionDependencies, "now"> = {},
) {
  const validated = validateMediaUsageInput(input);
  requireCapability(actor, "media.public.use");
  return prisma.$transaction(
    async (transaction) => {
      const admin = await transaction.adminUser.findFirst({
        where: { id: actor.adminUserId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!admin) throw new AuthorizationError();
      const eligibility =
        await evaluatePublicMediaAssetEligibilityInTransaction(
          transaction,
          validated.mediaAssetId,
          validated.usageType,
          dependencies.now?.() ?? new Date(),
        );
      if (!eligibility.eligible)
        throw new PreconditionError(
          "Media asset is not eligible for this usage.",
        );
      try {
        return await transaction.mediaUsage.create({ data: validated });
      } catch (error) {
        if (isPrismaCode(error, "P2002"))
          throw new ConcurrencyError("This media usage already exists.");
        throw error;
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function evaluatePublicMediaAssetEligibilityInTransaction(
  transaction: Transaction,
  mediaAssetId: string,
  proposedUse: PublicStorySubmissionMediaUse,
  now: Date,
) {
  const asset = await transaction.mediaAsset.findUnique({
    where: { id: mediaAssetId },
    select: { lifecycle: true, promotion: { select: { sourceMediaId: true } } },
  });
  if (!asset) throw new NotFoundError("Media asset was not found.");
  const reasons: string[] = [];
  if (asset.lifecycle !== MediaAssetLifecycle.ACTIVE)
    reasons.push("ASSET_ARCHIVED");
  if (!asset.promotion) reasons.push("PROVENANCE_MISSING");
  if (asset.promotion) {
    const source = await sourceEligibility(
      transaction,
      asset.promotion.sourceMediaId,
      proposedUse,
      now,
    );
    reasons.push(...source.reasons);
  }
  return { eligible: reasons.length === 0, reasons };
}

export async function getPublicMediaAssetForPublicRead(
  prisma: PrismaClient,
  mediaAssetId: string,
  now = new Date(),
) {
  assertUuid(mediaAssetId, "Media asset ID");
  const record = await prisma.mediaAsset.findUnique({
    where: { id: mediaAssetId },
    select: {
      id: true,
      publicStorageKey: true,
      format: true,
      width: true,
      height: true,
      publicCredit: true,
      lifecycle: true,
      promotion: { select: { sourceMediaId: true } },
    },
  });
  if (
    !record ||
    record.lifecycle !== MediaAssetLifecycle.ACTIVE ||
    !record.promotion
  )
    return null;
  const eligibility = await evaluatePublicMediaAssetEligibility(prisma, {
    mediaAssetId,
    proposedUse: PublicStorySubmissionMediaUse.WEBSITE_PUBLICATION,
    now,
  });
  return eligibility.eligible ? toPublicMediaAssetDto(record) : null;
}

export async function listExistingPublicMediaUsesForReview(
  prisma: PrismaClient,
  actor: PromotionActor,
  mediaAssetId: string,
) {
  assertUuid(mediaAssetId, "Media asset ID");
  if (
    !actor.capabilities.includes("communications.submissions.review") &&
    !actor.capabilities.includes("media.edit")
  )
    throw new AuthorizationError();
  const admin = await prisma.adminUser.findFirst({
    where: { id: actor.adminUserId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!admin) throw new AuthorizationError();
  return prisma.mediaUsage.findMany({
    where: { mediaAssetId },
    select: {
      id: true,
      usageType: true,
      subjectType: true,
      subjectId: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}
