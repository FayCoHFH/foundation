import {
  MediaAssetCreditTreatment,
  MediaAssetFormat,
  MediaAssetLifecycle,
  MediaUsageSubjectType,
  PublicStorySubmissionMediaUse,
} from "@/generated/prisma/client";
import { ValidationError } from "@/platform/errors/app-error";

export const PUBLIC_CREDIT_MAX_LENGTH = 240;

export type PromoteSubmissionMediaInput = Readonly<{
  mediaId: string;
  expectedMediaVersion: number;
  creditTreatment: MediaAssetCreditTreatment;
  publicCredit?: string | null;
}>;

export type CreateMediaUsageInput = Readonly<{
  mediaAssetId: string;
  usageType: PublicStorySubmissionMediaUse;
  subjectType: MediaUsageSubjectType;
  subjectId: string;
}>;

export type PublicMediaAssetAdminDto = Readonly<{
  id: string;
  publicPath: string;
  format: MediaAssetFormat;
  contentType: string;
  byteSize: number;
  checksumSha256: string;
  width: number;
  height: number;
  lifecycle: MediaAssetLifecycle;
  creditTreatment: MediaAssetCreditTreatment;
  publicCredit: string | null;
  rightsState: "ELIGIBLE" | "RESTRICTED";
  restrictionReasons: readonly string[];
  provenance: Readonly<{
    sourceMediaId: string;
    sourceSubmissionId: string;
    sourceMediaVersion: number;
    promotedAt: Date;
    promotionId: string;
  }>;
}>;

export type PublicMediaAssetDto = Readonly<{
  id: string;
  publicPath: string;
  format: MediaAssetFormat;
  width: number;
  height: number;
  publicCredit: string | null;
}>;

export function assertUuid(value: string, label: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new ValidationError(`${label} must be a valid identifier.`);
  }
}

export function validatePromoteSubmissionMediaInput(
  input: PromoteSubmissionMediaInput,
) {
  assertUuid(input.mediaId, "Media ID");
  if (
    !Number.isInteger(input.expectedMediaVersion) ||
    input.expectedMediaVersion < 1
  )
    throw new ValidationError("Expected media version must be positive.");
  if (!Object.values(MediaAssetCreditTreatment).includes(input.creditTreatment))
    throw new ValidationError("Credit treatment is not supported.");
  const publicCredit = input.publicCredit?.trim() || null;
  if (publicCredit && publicCredit.length > PUBLIC_CREDIT_MAX_LENGTH)
    throw new ValidationError("Public credit is too long.");
  if (
    input.creditTreatment !== MediaAssetCreditTreatment.NO_PUBLIC_CREDIT &&
    !publicCredit
  ) {
    throw new ValidationError(
      "A public credit is required for this treatment.",
    );
  }
  if (
    input.creditTreatment === MediaAssetCreditTreatment.NO_PUBLIC_CREDIT &&
    publicCredit
  ) {
    throw new ValidationError(
      "No-public-credit treatment cannot include credit.",
    );
  }
  return { ...input, publicCredit };
}

export function validateMediaUsageInput(input: CreateMediaUsageInput) {
  assertUuid(input.mediaAssetId, "Media asset ID");
  assertUuid(input.subjectId, "Usage subject ID");
  if (!Object.values(PublicStorySubmissionMediaUse).includes(input.usageType))
    throw new ValidationError("Usage type is not supported.");
  if (!Object.values(MediaUsageSubjectType).includes(input.subjectType))
    throw new ValidationError("Usage subject type is not supported.");
  return input;
}

export function publicPathForStorageKey(key: string) {
  return `/media/${key}`;
}

export function toPublicMediaAssetDto(asset: {
  id: string;
  publicStorageKey: string;
  format: MediaAssetFormat;
  width: number;
  height: number;
  publicCredit: string | null;
}): PublicMediaAssetDto {
  return {
    id: asset.id,
    publicPath: publicPathForStorageKey(asset.publicStorageKey),
    format: asset.format,
    width: asset.width,
    height: asset.height,
    publicCredit: asset.publicCredit,
  };
}
